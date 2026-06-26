import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localNodeBin = resolve(root, ".tools/node-v22.12.0-darwin-arm64/bin");
const localHome = resolve(root, ".tools/home");
const mode = process.argv[2] || "deploy";

mkdirSync(localHome, { recursive: true });

const env = {
  ...process.env,
  HOME: localHome,
  PATH: `${localNodeBin}:${process.env.PATH || ""}`,
};

const argsByMode = {
  login: ["wrangler", "login"],
  whoami: ["wrangler", "whoami"],
  deploy: ["wrangler", "pages", "deploy", "web", "--project-name", "worldcup-dashboard"],
};

if (!argsByMode[mode]) {
  console.error(`Unknown mode: ${mode}`);
  console.error("Use one of: login, whoami, deploy");
  process.exit(1);
}

const child = spawn("npx", argsByMode[mode], {
  cwd: root,
  env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
