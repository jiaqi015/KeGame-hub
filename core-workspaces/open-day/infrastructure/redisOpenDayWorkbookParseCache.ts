import type { OpenDayWorkbookParseCache, OpenDayWorkbookParseCachePayload } from '../application/openDayWorkbookParseCache.js';

const REDIS_CACHE_TTL = 60 * 60;

export class RedisOpenDayWorkbookParseCache implements OpenDayWorkbookParseCache {
  private redisClient: any = null;
  private initialized = false;

  constructor(
    private readonly redisUrl: string,
    private readonly ttlSeconds: number = REDIS_CACHE_TTL,
  ) {}

  private async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const { createClient } = await import('redis');
      this.redisClient = createClient({
        url: this.redisUrl,
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 5) return new Error('Redis 连接重试次数超限');
            return Math.min(retries * 50, 1000);
          },
        },
      });

      this.redisClient.on('error', (err: Error) => {
        console.warn('[RedisOpenDayWorkbookParseCache] Redis client error:', err.message);
      });

      await this.redisClient.connect();
      this.initialized = true;
    } catch (error) {
      console.warn('[RedisOpenDayWorkbookParseCache] Failed to initialize Redis, falling back:', error);
      this.initialized = false;
    }
  }

  async get(key: string): Promise<OpenDayWorkbookParseCachePayload | null> {
    try {
      await this.init();
      if (!this.redisClient?.isReady) return null;

      const data = await this.redisClient.get(key);
      if (!data) return null;

      return JSON.parse(data) as OpenDayWorkbookParseCachePayload;
    } catch (error) {
      console.warn('[RedisOpenDayWorkbookParseCache] GET failed:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  async set(key: string, value: OpenDayWorkbookParseCachePayload): Promise<void> {
    try {
      await this.init();
      if (!this.redisClient?.isReady) return;

      const data = JSON.stringify(value);
      await this.redisClient.setEx(key, this.ttlSeconds, data);
    } catch (error) {
      console.warn('[RedisOpenDayWorkbookParseCache] SET failed:', error instanceof Error ? error.message : error);
    }
  }
}
