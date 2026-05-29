// One-off helper: extract the PAGE_CSS template literal from render-site.mjs
// and write its content verbatim to docs/designs/backend-and-editorial-layer/_page.css
// so the integrated-mockup files can reference real production styling.
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("scripts/render-site.mjs", "utf8");
const startMarker = "const PAGE_CSS = `";
const startIdx = src.indexOf(startMarker);
if (startIdx < 0) throw new Error("PAGE_CSS not found");
const contentStart = startIdx + startMarker.length;

// Walk forward for the matching closing backtick, respecting backslash escapes.
let i = contentStart;
let end = -1;
while (i < src.length) {
  const c = src[i];
  if (c === "\\") { i += 2; continue; }
  if (c === "`") { end = i; break; }
  i++;
}
if (end < 0) throw new Error("closing backtick not found");

const css = src.slice(contentStart, end);
const outPath = "docs/designs/backend-and-editorial-layer/_page.css";
writeFileSync(outPath, css);

console.log("Wrote", css.length, "bytes /", css.split("\n").length, "lines to", outPath);
const checks = [
  '[data-theme="claude"]',
  '[data-theme="linear"]',
  "header.hero",
  ".lang-switch button",
  ".cards",
  ".card-title",
  ".fav-star",
  ".editors-cut",
  ".subscribe-form",
  ".site-nav",
];
for (const sel of checks) {
  console.log("  ", css.includes(sel) ? "✓" : "✗", sel);
}
