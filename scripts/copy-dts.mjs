import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

mkdirSync(dist, { recursive: true });

// Read all sub-package declarations and concatenate
const sources = [
  "packages/chat/dist/index.d.ts",
  "packages/adapter-slack/dist/index.d.ts",
  "packages/state-ioredis/dist/index.d.ts",
];

const parts = sources.map((src) => {
  const content = readFileSync(resolve(root, src), "utf-8");
  return `// From: ${src}\n${content}`;
});

const combined = parts.join("\n\n");

writeFileSync(resolve(dist, "index.d.ts"), combined);
writeFileSync(resolve(dist, "index.d.cts"), combined);

console.log("DTS barrel generated (combined declarations)");
