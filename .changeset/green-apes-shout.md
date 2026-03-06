---
"@chat-adapter/slack": patch
"chat": patch
---

Hydrate incoming thread history before running handlers so subscribed follow-ups receive recent thread context, including Slack file and image attachments. Slack DM history fetches now fall back to `conversations.history` when there is no thread timestamp.
