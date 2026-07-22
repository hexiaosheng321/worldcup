#!/usr/bin/env python3
"""Project adapter for deterministic, loss-aware Graphify builds."""

from __future__ import annotations

import argparse
import copy
import importlib
import importlib.util
import json
import re
import tempfile
from collections import defaultdict
from pathlib import Path

from graphify.detect import detect
from graphify.diagnostics import diagnose_extraction


MANIFEST_NAMES = {
    "package.json", "composer.json", "deno.json", "bower.json", "manifest.json"
}


def node_ids(extraction: dict) -> set[str]:
    return {
        node.get("id")
        for node in extraction.get("nodes", [])
        if isinstance(node, dict) and isinstance(node.get("id"), str)
    }


def endpoints(edge: dict) -> tuple[str | None, str | None]:
    return edge.get("source", edge.get("from")), edge.get("target", edge.get("to"))


def python_import_is_external(root: Path, edge: dict) -> bool:
    source_file = str(edge.get("source_file", ""))
    location = str(edge.get("source_location", ""))
    if Path(source_file).suffix != ".py" or edge.get("relation") not in {"imports", "imports_from"}:
        return False
    try:
        line_no = int(location.removeprefix("L").split("-")[0])
        line = (root / source_file).read_text(encoding="utf-8").splitlines()[line_no - 1]
    except (OSError, ValueError, IndexError):
        return False
    match = re.search(r"^\s*(?:from\s+([.\w]+)|import\s+([.\w]+))", line)
    module = next((group for group in match.groups() if group), "") if match else ""
    if not module or module.startswith("."):
        return False
    top_level = module.split(".", 1)[0]
    return not (root / f"{top_level}.py").exists() and not (root / top_level / "__init__.py").exists()


def is_external_reference(root: Path, edge: dict, missing_id: str) -> bool:
    if missing_id.startswith("ref_"):
        return True
    source_name = Path(str(edge.get("source_file", ""))).name
    return (
        source_name in MANIFEST_NAMES
        and edge.get("relation") in {"imports", "imports_from", "depends_on"}
    ) or python_import_is_external(root, edge)


def file_node_for(nodes: list[dict], source_file: str) -> str | None:
    matches = [
        node.get("id")
        for node in nodes
        if node.get("source_file") == source_file
        and node.get("label") == Path(source_file).name
    ]
    return matches[0] if len(matches) == 1 else None


def normalized_symbol(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.casefold()).strip("_")


def resolve_imported_binding(root: Path, edge: dict, missing_id: str) -> dict | None:
    source_file = str(edge.get("source_file", ""))
    location = str(edge.get("source_location", ""))
    if edge.get("relation") not in {"imports", "imports_from"} or not source_file or not location.startswith("L"):
        return None
    importer = (root / source_file).resolve()
    try:
        line_no = int(location[1:].split("-")[0])
        line = importer.read_text(encoding="utf-8").splitlines()[line_no - 1]
    except (OSError, ValueError, IndexError):
        return None
    module_match = re.search(r"\bfrom\s+['\"]([^'\"]+)['\"]", line)
    names_match = re.search(r"\{([^}]+)\}", line)
    if not module_match or not names_match or not module_match.group(1).startswith("."):
        return None
    target_file = (importer.parent / module_match.group(1)).resolve()
    if not target_file.is_file():
        return None
    try:
        target_file.relative_to(root.resolve())
    except ValueError:
        return None
    bindings = []
    for raw in names_match.group(1).split(","):
        original = raw.strip().split(" as ", 1)[0].strip()
        if original and normalized_symbol(missing_id).endswith(normalized_symbol(original)):
            bindings.append(original)
    if len(bindings) != 1:
        return None
    symbol = bindings[0]
    target_lines = target_file.read_text(encoding="utf-8").splitlines()
    definition_line = next(
        (index for index, text in enumerate(target_lines, 1)
         if re.search(rf"\b(?:export\s+)?(?:const|let|var|function|class)\s+{re.escape(symbol)}\b", text)),
        1,
    )
    return {
        "id": missing_id,
        "label": symbol,
        "file_type": "code",
        "type": "exported_binding_reference",
        "source_file": str(target_file.relative_to(root.resolve())),
        "source_location": f"L{definition_line}",
        "_origin": "project_graphify_adapter",
    }


def resolve_relative_data_asset(root: Path, edge: dict, missing_id: str) -> dict | None:
    source_file = str(edge.get("source_file", ""))
    location = str(edge.get("source_location", ""))
    if edge.get("relation") not in {"imports", "imports_from"} or not source_file or not location.startswith("L"):
        return None
    importer = (root / source_file).resolve()
    try:
        line_no = int(location[1:].split("-")[0])
        line = importer.read_text(encoding="utf-8").splitlines()[line_no - 1]
    except (OSError, ValueError, IndexError):
        return None
    module_match = re.search(r"\bfrom\s+['\"]([^'\"]+)['\"]", line)
    if not module_match or not module_match.group(1).startswith("."):
        return None
    target_file = (importer.parent / module_match.group(1)).resolve()
    if target_file.suffix.lower() != ".json" or not target_file.is_file():
        return None
    try:
        relative = target_file.relative_to(root.resolve())
    except ValueError:
        return None
    return {
        "id": missing_id,
        "label": target_file.name,
        "file_type": "concept",
        "type": "data_asset",
        "source_file": str(relative),
        "source_location": "L1",
        "_origin": "project_graphify_adapter",
    }


def external_stub(missing_id: str, edge: dict) -> dict:
    label = missing_id.removeprefix("ref_").replace("_", ":", 1)
    return {
        "id": missing_id,
        "label": label,
        "file_type": "concept",
        "type": "external_dependency",
        "source_file": str(edge.get("source_file", "")),
        "source_location": str(edge.get("source_location", "L1")),
        "_origin": "project_graphify_adapter",
    }


def fold_parallel_edges(edges: list[dict]) -> tuple[list[dict], int]:
    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    passthrough = []
    for edge in edges:
        source, target = endpoints(edge)
        if not source or not target:
            passthrough.append(edge)
            continue
        grouped[(source, target)].append(edge)

    folded = list(passthrough)
    folded_count = 0
    for pair in sorted(grouped):
        variants = grouped[pair]
        if len(variants) == 1:
            folded.append(variants[0])
            continue
        folded_count += len(variants) - 1
        ordered = sorted(variants, key=lambda item: (
            str(item.get("relation", "")), str(item.get("source_location", ""))
        ))
        merged = copy.deepcopy(ordered[0])
        relations = sorted({str(item.get("relation", "")) for item in ordered if item.get("relation")})
        contexts = sorted({str(item.get("context", "")) for item in ordered if item.get("context")})
        merged["relation"] = "|".join(relations)
        merged["relations"] = relations
        if contexts:
            merged["context"] = "|".join(contexts)
        merged["parallel_edges"] = [
            {key: value for key, value in item.items() if key not in {"source", "target", "from", "to"}}
            for item in ordered
        ]
        merged["_project_folded_parallel_edges"] = True
        folded.append(merged)
    return folded, folded_count


def normalize_extraction(extraction: dict, root: Path) -> tuple[dict, dict]:
    result = copy.deepcopy(extraction)
    nodes = result.setdefault("nodes", [])
    edges = result.setdefault("edges", [])
    ids = node_ids(result)
    stats = {
        "external_stubs": 0,
        "binding_stubs": 0,
        "data_asset_stubs": 0,
        "rewired_sources": 0,
        "unresolved": [],
    }

    for edge in edges:
        source, target = endpoints(edge)
        if source not in ids and source:
            replacement = file_node_for(nodes, str(edge.get("source_file", "")))
            if replacement:
                edge["source"] = replacement
                source = replacement
                stats["rewired_sources"] += 1
        for side, missing_id in (("source", source), ("target", target)):
            if not missing_id or missing_id in ids:
                continue
            if is_external_reference(root, edge, missing_id):
                stub = external_stub(missing_id, edge)
                stats["external_stubs"] += 1
            else:
                stub = resolve_relative_data_asset(root, edge, missing_id)
                if stub is not None:
                    stats["data_asset_stubs"] += 1
                else:
                    stub = resolve_imported_binding(root, edge, missing_id)
                    if stub is None:
                        stats["unresolved"].append({
                            "side": side, "id": missing_id,
                            "source_file": edge.get("source_file", ""),
                            "source_location": edge.get("source_location", ""),
                            "relation": edge.get("relation", ""),
                        })
                        continue
                    stats["binding_stubs"] += 1
            if stub["id"] not in ids:
                nodes.append(stub)
                ids.add(stub["id"])

    result["edges"], stats["folded_parallel_edges"] = fold_parallel_edges(edges)
    return result, stats


def source_files_with_nodes(extraction: dict, root: Path) -> set[Path]:
    files = set()
    for node in extraction.get("nodes", []):
        source_file = node.get("source_file") if isinstance(node, dict) else None
        if not source_file:
            continue
        path = Path(str(source_file))
        files.add((path if path.is_absolute() else root / path).resolve())
    return files


def health(root: Path, json_output: bool = False) -> int:
    detection = detect(root)
    code_files = [Path(path) for path in detection.get("files", {}).get("code", [])]
    # A worktree may point graphify-out at a shared read-only graph directory.
    # Health checks must not mutate that cache, so disable cache reads/writes in
    # this process while keeping the real project root for stable node IDs.
    extract_module = importlib.import_module("graphify.extract")
    extract_module.load_cached = lambda *_args, **_kwargs: None
    extract_module.save_cached = lambda *_args, **_kwargs: None
    extraction = extract_module.extract(code_files, cache_root=root, parallel=False)
    raw = diagnose_extraction(extraction, directed=True, root=root, max_examples=0)
    normalized, adapter = normalize_extraction(extraction, root)
    final = diagnose_extraction(normalized, directed=True, root=root, max_examples=0)
    present = source_files_with_nodes(extraction, root)
    zero_ast = [str(path.relative_to(root)) for path in code_files if path.resolve() not in present]
    sql_available = importlib.util.find_spec("tree_sitter_sql") is not None
    data_json = (
        list((root / "web/data").glob("*.json"))
        + list((root / "web/i18n").glob("*.json"))
        + list((root / "tools/data").glob("*.json"))
        + ([root / "web/_routes.json"] if (root / "web/_routes.json").is_file() else [])
    )
    detected_paths = {path.resolve() for path in code_files}
    unexcluded_data_json = [
        str(path.relative_to(root)) for path in data_json if path.resolve() in detected_paths
    ]
    ignored_json = len(data_json) - len(unexcluded_data_json)
    report = {
        "code_files": len(code_files),
        "data_json_excluded": ignored_json,
        "data_json_not_excluded": unexcluded_data_json,
        "zero_ast_files": zero_ast,
        "sql_parser_available": sql_available,
        "raw": raw,
        "adapter": adapter,
        "normalized": final,
    }
    ok = (
        not unexcluded_data_json
        and not zero_ast
        and sql_available
        and not adapter["unresolved"]
        and final["dangling_endpoint_edges"] == 0
        and final["missing_endpoint_edges"] == 0
        and final["directed_same_endpoint_collapsed_edges"] == 0
    )
    if json_output:
        print(json.dumps({**report, "ok": ok}, ensure_ascii=False, indent=2))
    else:
        print(f"Graphify project health: {'OK' if ok else 'FAILED'}")
        print(f"  code files: {len(code_files)}")
        print(f"  data JSON excluded: {ignored_json}/{len(data_json)}")
        print(f"  zero AST files: {len(zero_ast)}")
        print(f"  SQL parser: {'available' if sql_available else 'missing'}")
        print(
            "  raw dangling: "
            f"{raw['dangling_endpoint_edges']} "
            f"(adapter: {adapter['external_stubs']} external stubs, "
            f"{adapter['binding_stubs']} binding stubs, "
            f"{adapter['data_asset_stubs']} data assets, "
            f"{adapter['rewired_sources']} source rewrites)"
        )
        print(
            "  directed parallel edges: "
            f"{raw['directed_same_endpoint_collapsed_edges']} -> "
            f"{final['directed_same_endpoint_collapsed_edges']} "
            f"(preserved in {adapter['folded_parallel_edges']} parallel_edges records)"
        )
        print(f"  reverse-direction pairs (directed build preserves them): {final['undirected_same_endpoint_collapsed_edges']}")
        if zero_ast:
            print("  zero AST: " + ", ".join(zero_ast))
        if adapter["unresolved"]:
            print("  unresolved internal endpoints:")
            for item in adapter["unresolved"]:
                print(f"    {item['id']} at {item['source_file']}:{item['source_location']}")
    return 0 if ok else 1


def normalize_file(root: Path, input_path: Path, output_path: Path) -> int:
    data = json.loads(input_path.read_text(encoding="utf-8"))
    normalized, stats = normalize_extraction(data, root)
    if stats["unresolved"]:
        print(json.dumps(stats, ensure_ascii=False, indent=2))
        print("Refusing to write: unresolved internal endpoints remain.")
        return 1
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    temporary.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(output_path)
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    print(f"Normalized extraction written to {output_path}")
    return 0


def self_test() -> int:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root / "src").mkdir()
        (root / "src/main.js").write_text(
            'import { FLAG } from "./defs.js";\nimport data from "./data.json" with { type: "json" };\n',
            encoding="utf-8",
        )
        (root / "src/defs.js").write_text("export const FLAG = true;\n", encoding="utf-8")
        (root / "src/data.json").write_text('{"ok":true}\n', encoding="utf-8")
        extraction = {
            "nodes": [
                {"id": "src_main", "label": "main.js", "file_type": "code", "source_file": "src/main.js"},
                {"id": "src_defs", "label": "defs.js", "file_type": "code", "source_file": "src/defs.js"},
                {"id": "src_defs_run", "label": "run()", "file_type": "code", "source_file": "src/defs.js"},
            ],
            "edges": [
                {"source": "src_main", "target": "ref_node_fs", "relation": "imports_from", "confidence": "EXTRACTED", "source_file": "src/main.js", "source_location": "L1"},
                {"source": "src_main", "target": "abs_src_defs_flag", "relation": "imports", "confidence": "EXTRACTED", "source_file": "src/main.js", "source_location": "L1"},
                {"source": "src_main", "target": "abs_src_data_json", "relation": "imports_from", "confidence": "EXTRACTED", "source_file": "src/main.js", "source_location": "L2"},
                {"source": "abs_src_main", "target": "src_defs_run", "relation": "indirect_call", "confidence": "INFERRED", "source_file": "src/main.js", "source_location": "L1"},
                {"source": "src_defs", "target": "src_defs_run", "relation": "contains", "confidence": "EXTRACTED", "source_file": "src/defs.js", "source_location": "L1"},
                {"source": "src_defs", "target": "src_defs_run", "relation": "indirect_call", "confidence": "INFERRED", "source_file": "src/defs.js", "source_location": "L1"},
            ],
        }
        normalized, stats = normalize_extraction(extraction, root)
        summary = diagnose_extraction(normalized, directed=True, root=root, max_examples=0)
        assert stats == {
            "external_stubs": 1,
            "binding_stubs": 1,
            "data_asset_stubs": 1,
            "rewired_sources": 1,
            "unresolved": [],
            "folded_parallel_edges": 1,
        }
        assert summary["dangling_endpoint_edges"] == 0
        assert summary["directed_same_endpoint_collapsed_edges"] == 0
    print("Graphify project adapter self-test: OK")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("health", "normalize", "self-test"))
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    if args.command == "health":
        return health(root, args.json)
    if args.command == "self-test":
        return self_test()
    input_path = (args.input or root / "graphify-out/.graphify_extract.json").resolve()
    output_path = (args.output or input_path).resolve()
    if not input_path.exists():
        print(f"Extraction not found: {input_path}")
        return 1
    return normalize_file(root, input_path, output_path)


if __name__ == "__main__":
    raise SystemExit(main())
