import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chat } from "./chat";
import { parseMarkdown } from "./markdown";
import {
  deserializeMessage,
  type SerializedMessage,
  type SerializedThread,
  serializeMessage,
  ThreadImpl,
} from "./thread";
import type {
  Adapter,
  FormattedContent,
  Lock,
  Message,
  StateAdapter,
} from "./types";

// Helper to create test messages
function createTestMessage(
  id: string,
  text: string,
  options?: Partial<Message>,
): Message {
  return {
    id,
    threadId: "slack:C123:1234.5678",
    text,
    formatted: parseMarkdown(text),
    raw: { some: "data" },
    author: {
      userId: "U123",
      userName: "testuser",
      fullName: "Test User",
      isBot: false,
      isMe: false,
    },
    metadata: {
      dateSent: new Date("2024-01-15T10:30:00.000Z"),
      edited: false,
    },
    attachments: [],
    ...options,
  };
}

// Mock adapter
function createMockAdapter(name = "slack"): Adapter {
  return {
    name,
    userName: `${name}-bot`,
    initialize: vi.fn().mockResolvedValue(undefined),
    handleWebhook: vi.fn().mockResolvedValue(new Response("ok")),
    postMessage: vi
      .fn()
      .mockResolvedValue({ id: "msg-1", threadId: undefined, raw: {} }),
    editMessage: vi
      .fn()
      .mockResolvedValue({ id: "msg-1", threadId: undefined, raw: {} }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    addReaction: vi.fn().mockResolvedValue(undefined),
    removeReaction: vi.fn().mockResolvedValue(undefined),
    startTyping: vi.fn().mockResolvedValue(undefined),
    fetchMessages: vi
      .fn()
      .mockResolvedValue({ messages: [], nextCursor: undefined }),
    fetchThread: vi
      .fn()
      .mockResolvedValue({ id: "t1", channelId: "c1", metadata: {} }),
    encodeThreadId: vi.fn(
      (data: { channel: string; thread: string }) =>
        `${name}:${data.channel}:${data.thread}`,
    ),
    decodeThreadId: vi.fn((id: string) => {
      const [, channel, thread] = id.split(":");
      return { channel, thread };
    }),
    parseMessage: vi.fn(),
    renderFormatted: vi.fn((_content: FormattedContent) => "formatted"),
    openDM: vi
      .fn()
      .mockImplementation((userId: string) =>
        Promise.resolve(`${name}:D${userId}:`),
      ),
    isDM: vi
      .fn()
      .mockImplementation((threadId: string) => threadId.includes(":D")),
  };
}

// Mock state adapter
function createMockState(): StateAdapter & { cache: Map<string, unknown> } {
  const subscriptions = new Set<string>();
  const locks = new Map<string, Lock>();
  const cache = new Map<string, unknown>();

  return {
    cache,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockImplementation(async (id: string) => {
      subscriptions.add(id);
    }),
    unsubscribe: vi.fn().mockImplementation(async (id: string) => {
      subscriptions.delete(id);
    }),
    isSubscribed: vi.fn().mockImplementation(async (id: string) => {
      return subscriptions.has(id);
    }),
    listSubscriptions: vi.fn().mockImplementation(async function* () {
      for (const id of subscriptions) yield id;
    }),
    acquireLock: vi
      .fn()
      .mockImplementation(async (threadId: string, ttlMs: number) => {
        if (locks.has(threadId)) return null;
        const lock: Lock = {
          threadId,
          token: "test-token",
          expiresAt: Date.now() + ttlMs,
        };
        locks.set(threadId, lock);
        return lock;
      }),
    releaseLock: vi.fn().mockImplementation(async (lock: Lock) => {
      locks.delete(lock.threadId);
    }),
    extendLock: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockImplementation(async (key: string) => {
      return cache.get(key) ?? null;
    }),
    set: vi.fn().mockImplementation(async (key: string, value: unknown) => {
      cache.set(key, value);
    }),
    delete: vi.fn().mockImplementation(async (key: string) => {
      cache.delete(key);
    }),
  };
}

describe("Serialization", () => {
  describe("ThreadImpl.toJSON()", () => {
    it("should serialize thread with correct type tag", () => {
      const mockAdapter = createMockAdapter("slack");
      const mockState = createMockState();

      const thread = new ThreadImpl({
        id: "slack:C123:1234.5678",
        adapter: mockAdapter,
        channelId: "C123",
        stateAdapter: mockState,
        isDM: false,
      });

      const json = thread.toJSON();

      expect(json).toEqual({
        _type: "chat:Thread",
        id: "slack:C123:1234.5678",
        channelId: "C123",
        isDM: false,
        adapterName: "slack",
      });
    });

    it("should serialize DM thread correctly", () => {
      const mockAdapter = createMockAdapter("slack");
      const mockState = createMockState();

      const thread = new ThreadImpl({
        id: "slack:DU123:",
        adapter: mockAdapter,
        channelId: "DU123",
        stateAdapter: mockState,
        isDM: true,
      });

      const json = thread.toJSON();

      expect(json._type).toBe("chat:Thread");
      expect(json.isDM).toBe(true);
    });

    it("should produce JSON-serializable output", () => {
      const mockAdapter = createMockAdapter("teams");
      const mockState = createMockState();

      const thread = new ThreadImpl({
        id: "teams:channel123:thread456",
        adapter: mockAdapter,
        channelId: "channel123",
        stateAdapter: mockState,
      });

      const json = thread.toJSON();
      const stringified = JSON.stringify(json);
      const parsed = JSON.parse(stringified);

      expect(parsed).toEqual(json);
    });
  });

  describe("ThreadImpl.fromJSON()", () => {
    let chat: Chat;
    let mockState: ReturnType<typeof createMockState>;

    beforeEach(() => {
      mockState = createMockState();
      chat = new Chat({
        userName: "test-bot",
        adapters: {
          slack: createMockAdapter("slack"),
          teams: createMockAdapter("teams"),
        },
        state: mockState,
        logger: "silent",
      });
    });

    it("should reconstruct thread from JSON", () => {
      const json: SerializedThread = {
        _type: "chat:Thread",
        id: "slack:C123:1234.5678",
        channelId: "C123",
        isDM: false,
        adapterName: "slack",
      };

      const thread = ThreadImpl.fromJSON(chat, json);

      expect(thread.id).toBe("slack:C123:1234.5678");
      expect(thread.channelId).toBe("C123");
      expect(thread.isDM).toBe(false);
      expect(thread.adapter.name).toBe("slack");
    });

    it("should reconstruct DM thread", () => {
      const json: SerializedThread = {
        _type: "chat:Thread",
        id: "slack:DU456:",
        channelId: "DU456",
        isDM: true,
        adapterName: "slack",
      };

      const thread = ThreadImpl.fromJSON(chat, json);

      expect(thread.isDM).toBe(true);
    });

    it("should throw error for unknown adapter", () => {
      const json: SerializedThread = {
        _type: "chat:Thread",
        id: "discord:channel:thread",
        channelId: "channel",
        isDM: false,
        adapterName: "discord",
      };

      expect(() => ThreadImpl.fromJSON(chat, json)).toThrow(
        'Adapter "discord" not found in chat instance',
      );
    });

    it("should round-trip correctly", () => {
      const mockAdapter = createMockAdapter("slack");

      const original = new ThreadImpl({
        id: "slack:C123:1234.5678",
        adapter: mockAdapter,
        channelId: "C123",
        stateAdapter: mockState,
        isDM: true,
      });

      const json = original.toJSON();
      const restored = ThreadImpl.fromJSON(chat, json);

      expect(restored.id).toBe(original.id);
      expect(restored.channelId).toBe(original.channelId);
      expect(restored.isDM).toBe(original.isDM);
      expect(restored.adapter.name).toBe(original.adapter.name);
    });
  });

  describe("serializeMessage()", () => {
    it("should serialize message with correct type tag", () => {
      const message = createTestMessage("msg-1", "Hello world");

      const json = serializeMessage(message);

      expect(json._type).toBe("chat:Message");
      expect(json.id).toBe("msg-1");
      expect(json.text).toBe("Hello world");
    });

    it("should convert Date to ISO string", () => {
      const message = createTestMessage("msg-1", "Test", {
        metadata: {
          dateSent: new Date("2024-01-15T10:30:00.000Z"),
          edited: true,
          editedAt: new Date("2024-01-15T11:00:00.000Z"),
        },
      });

      const json = serializeMessage(message);

      expect(json.metadata.dateSent).toBe("2024-01-15T10:30:00.000Z");
      expect(json.metadata.editedAt).toBe("2024-01-15T11:00:00.000Z");
    });

    it("should handle undefined editedAt", () => {
      const message = createTestMessage("msg-1", "Test", {
        metadata: {
          dateSent: new Date("2024-01-15T10:30:00.000Z"),
          edited: false,
        },
      });

      const json = serializeMessage(message);

      expect(json.metadata.editedAt).toBeUndefined();
    });

    it("should serialize author correctly", () => {
      const message = createTestMessage("msg-1", "Test");

      const json = serializeMessage(message);

      expect(json.author).toEqual({
        userId: "U123",
        userName: "testuser",
        fullName: "Test User",
        isBot: false,
        isMe: false,
      });
    });

    it("should serialize attachments without data/fetchData", () => {
      const message = createTestMessage("msg-1", "Test", {
        attachments: [
          {
            type: "image",
            url: "https://example.com/image.png",
            name: "image.png",
            mimeType: "image/png",
            size: 1024,
            width: 800,
            height: 600,
            data: Buffer.from("test"),
            fetchData: () => Promise.resolve(Buffer.from("test")),
          },
        ],
      });

      const json = serializeMessage(message);

      expect(json.attachments).toHaveLength(1);
      expect(json.attachments[0]).toEqual({
        type: "image",
        url: "https://example.com/image.png",
        name: "image.png",
        mimeType: "image/png",
        size: 1024,
        width: 800,
        height: 600,
      });
      // Ensure data and fetchData are not present
      expect("data" in json.attachments[0]).toBe(false);
      expect("fetchData" in json.attachments[0]).toBe(false);
    });

    it("should serialize isMention flag", () => {
      const message = createTestMessage("msg-1", "Test", {
        isMention: true,
      });

      const json = serializeMessage(message);

      expect(json.isMention).toBe(true);
    });

    it("should produce JSON-serializable output", () => {
      const message = createTestMessage("msg-1", "Hello **world**");

      const json = serializeMessage(message);
      const stringified = JSON.stringify(json);
      const parsed = JSON.parse(stringified);

      expect(parsed._type).toBe("chat:Message");
      expect(parsed.text).toBe("Hello **world**");
    });
  });

  describe("deserializeMessage()", () => {
    it("should restore message from JSON", () => {
      const json: SerializedMessage = {
        _type: "chat:Message",
        id: "msg-1",
        threadId: "slack:C123:1234.5678",
        text: "Hello world",
        formatted: { type: "root", children: [] },
        raw: { some: "data" },
        author: {
          userId: "U123",
          userName: "testuser",
          fullName: "Test User",
          isBot: false,
          isMe: false,
        },
        metadata: {
          dateSent: "2024-01-15T10:30:00.000Z",
          edited: false,
        },
        attachments: [],
      };

      const message = deserializeMessage(json);

      expect(message.id).toBe("msg-1");
      expect(message.text).toBe("Hello world");
      expect(message.author.userName).toBe("testuser");
    });

    it("should convert ISO strings back to Date objects", () => {
      const json: SerializedMessage = {
        _type: "chat:Message",
        id: "msg-1",
        threadId: "slack:C123:1234.5678",
        text: "Test",
        formatted: { type: "root", children: [] },
        raw: {},
        author: {
          userId: "U123",
          userName: "testuser",
          fullName: "Test User",
          isBot: false,
          isMe: false,
        },
        metadata: {
          dateSent: "2024-01-15T10:30:00.000Z",
          edited: true,
          editedAt: "2024-01-15T11:00:00.000Z",
        },
        attachments: [],
      };

      const message = deserializeMessage(json);

      expect(message.metadata.dateSent).toBeInstanceOf(Date);
      expect(message.metadata.dateSent.toISOString()).toBe(
        "2024-01-15T10:30:00.000Z",
      );
      expect(message.metadata.editedAt).toBeInstanceOf(Date);
      expect(message.metadata.editedAt?.toISOString()).toBe(
        "2024-01-15T11:00:00.000Z",
      );
    });

    it("should handle undefined editedAt", () => {
      const json: SerializedMessage = {
        _type: "chat:Message",
        id: "msg-1",
        threadId: "slack:C123:1234.5678",
        text: "Test",
        formatted: { type: "root", children: [] },
        raw: {},
        author: {
          userId: "U123",
          userName: "testuser",
          fullName: "Test User",
          isBot: false,
          isMe: false,
        },
        metadata: {
          dateSent: "2024-01-15T10:30:00.000Z",
          edited: false,
        },
        attachments: [],
      };

      const message = deserializeMessage(json);

      expect(message.metadata.editedAt).toBeUndefined();
    });

    it("should round-trip correctly", () => {
      const original = createTestMessage("msg-1", "Hello **world**", {
        isMention: true,
        metadata: {
          dateSent: new Date("2024-01-15T10:30:00.000Z"),
          edited: true,
          editedAt: new Date("2024-01-15T11:00:00.000Z"),
        },
        attachments: [
          {
            type: "file",
            url: "https://example.com/file.pdf",
            name: "file.pdf",
          },
        ],
      });

      const json = serializeMessage(original);
      const restored = deserializeMessage(json);

      expect(restored.id).toBe(original.id);
      expect(restored.text).toBe(original.text);
      expect(restored.isMention).toBe(original.isMention);
      expect(restored.metadata.dateSent.getTime()).toBe(
        original.metadata.dateSent.getTime(),
      );
      expect(restored.metadata.editedAt?.getTime()).toBe(
        original.metadata.editedAt?.getTime(),
      );
      expect(restored.attachments).toEqual([
        {
          type: "file",
          url: "https://example.com/file.pdf",
          name: "file.pdf",
        },
      ]);
    });
  });

  describe("chat.reviver()", () => {
    let chat: Chat;
    let mockState: ReturnType<typeof createMockState>;

    beforeEach(() => {
      mockState = createMockState();
      chat = new Chat({
        userName: "test-bot",
        adapters: {
          slack: createMockAdapter("slack"),
          teams: createMockAdapter("teams"),
        },
        state: mockState,
        logger: "silent",
      });
    });

    it("should revive chat:Thread objects", () => {
      const json: SerializedThread = {
        _type: "chat:Thread",
        id: "slack:C123:1234.5678",
        channelId: "C123",
        isDM: false,
        adapterName: "slack",
      };

      const payload = JSON.stringify({ thread: json });
      const parsed = JSON.parse(payload, chat.reviver());

      expect(parsed.thread).toBeInstanceOf(ThreadImpl);
      expect(parsed.thread.id).toBe("slack:C123:1234.5678");
    });

    it("should revive chat:Message objects", () => {
      const json: SerializedMessage = {
        _type: "chat:Message",
        id: "msg-1",
        threadId: "slack:C123:1234.5678",
        text: "Hello",
        formatted: { type: "root", children: [] },
        raw: {},
        author: {
          userId: "U123",
          userName: "testuser",
          fullName: "Test User",
          isBot: false,
          isMe: false,
        },
        metadata: {
          dateSent: "2024-01-15T10:30:00.000Z",
          edited: false,
        },
        attachments: [],
      };

      const payload = JSON.stringify({ message: json });
      const parsed = JSON.parse(payload, chat.reviver());

      expect(parsed.message.id).toBe("msg-1");
      expect(parsed.message.metadata.dateSent).toBeInstanceOf(Date);
    });

    it("should revive both Thread and Message in same payload", () => {
      const threadJson: SerializedThread = {
        _type: "chat:Thread",
        id: "slack:C123:1234.5678",
        channelId: "C123",
        isDM: false,
        adapterName: "slack",
      };

      const messageJson: SerializedMessage = {
        _type: "chat:Message",
        id: "msg-1",
        threadId: "slack:C123:1234.5678",
        text: "Hello",
        formatted: { type: "root", children: [] },
        raw: {},
        author: {
          userId: "U123",
          userName: "testuser",
          fullName: "Test User",
          isBot: false,
          isMe: false,
        },
        metadata: {
          dateSent: "2024-01-15T10:30:00.000Z",
          edited: false,
        },
        attachments: [],
      };

      const payload = JSON.stringify({
        thread: threadJson,
        message: messageJson,
      });
      const parsed = JSON.parse(payload, chat.reviver());

      expect(parsed.thread).toBeInstanceOf(ThreadImpl);
      expect(parsed.message.metadata.dateSent).toBeInstanceOf(Date);
    });

    it("should leave non-chat objects unchanged", () => {
      const payload = JSON.stringify({
        name: "test",
        count: 42,
        nested: { _type: "other:Type", value: "unchanged" },
      });

      const parsed = JSON.parse(payload, chat.reviver());

      expect(parsed.name).toBe("test");
      expect(parsed.count).toBe(42);
      expect(parsed.nested._type).toBe("other:Type");
    });

    it("should work with nested structures", () => {
      const messageJson: SerializedMessage = {
        _type: "chat:Message",
        id: "msg-1",
        threadId: "slack:C123:1234.5678",
        text: "Hello",
        formatted: { type: "root", children: [] },
        raw: {},
        author: {
          userId: "U123",
          userName: "testuser",
          fullName: "Test User",
          isBot: false,
          isMe: false,
        },
        metadata: {
          dateSent: "2024-01-15T10:30:00.000Z",
          edited: false,
        },
        attachments: [],
      };

      const payload = JSON.stringify({
        data: {
          messages: [messageJson],
        },
      });

      const parsed = JSON.parse(payload, chat.reviver());

      expect(parsed.data.messages[0].metadata.dateSent).toBeInstanceOf(Date);
    });
  });
});
