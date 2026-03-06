import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

mkdirSync(dist, { recursive: true });

// Copy .d.ts from sub-package builds into root dist
const copies = [
  ["packages/chat/dist/index.d.ts", "dist/index.d.ts"],
  ["packages/chat/dist/index.d.cts", "dist/index.d.cts"],
  ["packages/adapter-slack/dist/index.d.ts", "dist/slack.d.ts"],
  ["packages/adapter-slack/dist/index.d.cts", "dist/slack.d.cts"],
  ["packages/state-ioredis/dist/index.d.ts", "dist/state-ioredis.d.ts"],
  ["packages/state-ioredis/dist/index.d.cts", "dist/state-ioredis.d.cts"],
];

for (const [src, dest] of copies) {
  copyFileSync(resolve(root, src), resolve(root, dest));
  console.log(`  ${src} → ${dest}`);
}

console.log("DTS copy complete");
