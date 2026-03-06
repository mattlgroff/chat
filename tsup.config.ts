import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    slack: "src/slack.ts",
    "state-ioredis": "src/state-ioredis.ts",
  },
  format: ["esm", "cjs"],
  dts: false,
  clean: true,
  sourcemap: true,
});
