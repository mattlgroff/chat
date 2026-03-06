import { Logger, StateAdapter, Lock } from 'chat';
import Redis from 'ioredis';

interface IoRedisStateAdapterOptions {
    /** Key prefix for all Redis keys (default: "chat-sdk") */
    keyPrefix?: string;
    /** Logger instance for error reporting */
    logger: Logger;
    /** Redis connection URL (e.g., redis://localhost:6379) */
    url: string;
}
interface IoRedisStateClientOptions {
    /** Existing ioredis client instance */
    client: Redis;
    /** Key prefix for all Redis keys (default: "chat-sdk") */
    keyPrefix?: string;
    /** Logger instance for error reporting */
    logger: Logger;
}
/**
 * Redis state adapter using ioredis for production use.
 *
 * Provides persistent subscriptions and distributed locking
 * across multiple server instances.
 *
 * @example
 * ```typescript
 * // With URL
 * const state = createIoRedisState({ url: process.env.REDIS_URL });
 *
 * // With existing client
 * const client = new Redis(process.env.REDIS_URL);
 * const state = createIoRedisState({ client });
 * ```
 */
declare class IoRedisStateAdapter implements StateAdapter {
    private readonly client;
    private readonly keyPrefix;
    private readonly logger;
    private connected;
    private connectPromise;
    private readonly ownsClient;
    constructor(options: IoRedisStateAdapterOptions | IoRedisStateClientOptions);
    private key;
    private subscriptionsSetKey;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    subscribe(threadId: string): Promise<void>;
    unsubscribe(threadId: string): Promise<void>;
    isSubscribed(threadId: string): Promise<boolean>;
    acquireLock(threadId: string, ttlMs: number): Promise<Lock | null>;
    releaseLock(lock: Lock): Promise<void>;
    extendLock(lock: Lock, ttlMs: number): Promise<boolean>;
    get<T = unknown>(key: string): Promise<T | null>;
    set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;
    setIfNotExists(key: string, value: unknown, ttlMs?: number): Promise<boolean>;
    delete(key: string): Promise<void>;
    private ensureConnected;
    /**
     * Get the underlying ioredis client for advanced usage.
     */
    getClient(): Redis;
}
/**
 * Create an ioredis state adapter.
 *
 * @example
 * ```typescript
 * // With URL
 * const state = createIoRedisState({ url: process.env.REDIS_URL });
 *
 * // With existing client
 * import Redis from "ioredis";
 * const client = new Redis(process.env.REDIS_URL);
 * const state = createIoRedisState({ client });
 * ```
 */
declare function createIoRedisState(options: IoRedisStateAdapterOptions | IoRedisStateClientOptions): IoRedisStateAdapter;

export { IoRedisStateAdapter, type IoRedisStateAdapterOptions, type IoRedisStateClientOptions, createIoRedisState };
