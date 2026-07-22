import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function pythonCandidates() {
  const candidates = [];
  if (process.env.GRAPHIFY_PYTHON) candidates.push(process.env.GRAPHIFY_PYTHON);
  const marker = resolve(projectRoot, "graphify-out/.graphify_python");
  if (existsSync(marker)) candidates.push(readFileSync(marker, "utf8").trim());
  candidates.push("python3");
  return [...new Set(candidates.filter(Boolean))];
}

function graphifyPython() {
  for (const candidate of pythonCandidates()) {
    const probe = spawnSync(candidate, ["-c", "import graphify"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("找不到可用的 Graphify Python；先运行 npm run graphify:setup，或设置 GRAPHIFY_PYTHON。");
}

function availablePython() {
  for (const candidate of pythonCandidates()) {
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("找不到可用的 Python；请安装 Python 3 或设置 GRAPHIFY_PYTHON。");
}

const command = process.argv[2] || "health";
const forwarded = process.argv.slice(3);
let python;

try {
  python = command === "setup" ? availablePython() : graphifyPython();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const args = command === "setup"
  ? ["-m", "pip", "install", "-r", resolve(projectRoot, "requirements-graphify.txt")]
  : [resolve(projectRoot, "tools/graphify-project.py"), command, "--root", projectRoot, ...forwarded];

const result = spawnSync(python, args, { cwd: projectRoot, stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
