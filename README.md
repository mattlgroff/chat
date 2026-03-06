# chat-sdk

**A CJS+ESM fork of [vercel/chat](https://github.com/vercel/chat) — the unified chat abstraction for Slack, Teams, Google Chat, and Discord.**

## Why We Forked

The upstream `vercel/chat` SDK is ESM-only. Our backend runs on NestJS with webpack, which compiles to CommonJS. This forced us to use fragile runtime hacks (`new Function("return import(…)")`) to dynamically import the SDK, and we had to maintain a 1,100-line duplicated type file because TypeScript couldn't resolve types from ESM-only packages in our CJS build.

On top of that, the upstream SDK has two bugs that affect our Slack DM integration:

1. **`invalid_thread_ts` in DMs** — Top-level DM messages encode `threadTs` as `""` (empty string). When posting replies, this empty string gets passed to the Slack API as `thread_ts: ""` instead of `undefined`, causing `invalid_thread_ts` errors. ([vercel/chat#171](https://github.com/vercel/chat/issues/171))

2. **`file_share` subtype dropped** — The message handler originally rejected all subtypes except `bot_message`, silently dropping file uploads. *(Fixed in upstream HEAD but not yet released at the time of forking.)*

## What Changed

### Single-package barrel

The upstream repo is a pnpm monorepo with separate packages (`chat`, `@chat-adapter/slack`, `@chat-adapter/shared`, `@chat-adapter/state-ioredis`). We bundle the three packages we use into a **single installable package** via a root-level `src/index.ts` barrel that re-exports everything:

```ts
// All exports from chat, @chat-adapter/slack, and @chat-adapter/state-ioredis
import { Chat, emoji, createSlackAdapter, createIoRedisState } from 'chat-sdk';
```

This means `npm install github:mattlgroff/chat` just works — no monorepo tooling, no subpath exports, no module resolution headaches.

### CJS + ESM dual output

Every sub-package's `tsup.config.ts` changed from `format: ["esm"]` to `format: ["esm", "cjs"]`, and `package.json` exports include both `"import"` and `"require"` conditions. The root barrel also builds to both formats.

### Bug fixes (adapter-slack)

All `thread_ts: threadTs` calls in `postMessage`, `postEphemeral`, and `stream` methods are now guarded with `|| undefined` to prevent empty-string thread timestamps from reaching the Slack API.

## Merging Upstream Changes

The sub-packages are untouched structurally — our changes are:

- **`packages/*/tsup.config.ts`** — added `"cjs"` to format array (1-line diff each)
- **`packages/*/package.json`** — added `"require"` export and updated `"main"` (2-3 line diff each)
- **`packages/adapter-slack/src/index.ts`** — `thread_ts` guards (7 lines changed)
- **Root-level additions** — `src/`, `dist/`, `scripts/`, `tsup.config.ts`, `tsconfig.json` (new files, won't conflict)

To merge upstream:

```bash
git remote add upstream https://github.com/vercel/chat.git
git fetch upstream
git merge upstream/main
# Resolve any conflicts in the sub-package files above
# Then rebuild:
pnpm install
pnpm build          # builds sub-packages via turbo
pnpm build:root     # bundles root barrel (CJS+ESM)
pnpm build:dts      # copies type declarations from sub-packages
git add dist/ && git commit
```

Since our sub-package changes are minimal (format + exports + the thread_ts guard), upstream merges should be clean unless they modify the exact same lines.

## Install

```bash
npm install github:mattlgroff/chat
```

## Usage

```typescript
import { Chat, createSlackAdapter, createIoRedisState, emoji } from 'chat-sdk';

const bot = new Chat({
  userName: 'mybot',
  adapters: {
    slack: createSlackAdapter({ botToken, signingSecret }),
  },
  state: createIoRedisState({ client: redisClient }),
});

bot.onNewMention(async (thread, message) => {
  await thread.subscribe();
  await thread.post('Hello! I heard you.');
});

bot.onSubscribedMessage(async (thread, message) => {
  await thread.post(`You said: ${message.text}`);
});
```

## Build (for maintainers)

```bash
pnpm install
pnpm build           # sub-packages (turbo)
pnpm build:root      # root barrel
pnpm build:dts       # type declarations
```

The `dist/` directory is committed so consumers can install directly from GitHub without needing to build.

## License

MIT — same as [upstream](https://github.com/vercel/chat).
