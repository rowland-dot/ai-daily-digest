// preview-demo.mjs
//
// One-command demo preview:
//   1. Build .preview-data/ with sample editorial fields injected
//   2. Render the site against .preview-data/
//   3. Serve docs/ on http://localhost:8000
//
// Used by `npm run preview:demo`. Works cross-platform (no cross-env).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function run(cmd, args, env = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    p.on("exit", (code) =>
      code === 0
        ? res()
        : rej(new Error(`${cmd} ${args.join(" ")} exited ${code}`)),
    );
  });
}

console.log("[preview:demo] step 1/3 — build .preview-data/");
await run("node", ["scripts/build-preview-data.mjs"]);

console.log("[preview:demo] step 2/3 — render with injected editorial");
await run("node", ["scripts/render-site.mjs"], {
  DATA_DIR: ".preview-data",
  // Widen the freshness window so older sample data still renders aihot
  // model/product/industry/paper sections (which are where Editor's Cut
  // commentary boxes attach).
  LOOKBACK_HOURS: "720",
  // Flip the feature flag ON so backend-dependent UI (subscribe form,
  // /account page, sync-favourites prompt) renders. The backend API
  // itself isn't running, so buttons that POST to /api/* will 404 —
  // that's expected. Visual preview only.
  BACKEND_LIVE: "true",
});

console.log("[preview:demo] step 3/3 — serve on http://localhost:8000");
console.log("                         Ctrl+C to stop");
const server = spawn("npx", ["serve", "docs", "-l", "8000"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: process.platform === "win32",
});
server.on("exit", (code) => process.exit(code ?? 0));
