import type { OpenDayAnalysisResponse } from '../domain/openDay.types.js';
import type { OpenDayAnalysisCache } from '../application/openDayAnalysisCache.js';

const REDIS_CACHE_TTL = 30 * 60;

export class RedisOpenDayAnalysisCache implements OpenDayAnalysisCache {
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
        console.warn('[RedisOpenDayAnalysisCache] Redis client error:', err.message);
      });

      await this.redisClient.connect();
      this.initialized = true;
    } catch (error) {
      console.warn('[RedisOpenDayAnalysisCache] Failed to initialize Redis, falling back:', error);
      this.initialized = false;
    }
  }

  async get(key: string): Promise<OpenDayAnalysisResponse | null> {
    try {
      await this.init();
      if (!this.redisClient?.isReady) return null;

      const data = await this.redisClient.get(key);
      if (!data) return null;

      return JSON.parse(data) as OpenDayAnalysisResponse;
    } catch (error) {
      console.warn('[RedisOpenDayAnalysisCache] GET failed:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  async set(key: string, value: OpenDayAnalysisResponse): Promise<void> {
    try {
      await this.init();
      if (!this.redisClient?.isReady) return;

      const data = JSON.stringify(value);
      await this.redisClient.setEx(key, this.ttlSeconds, data);
    } catch (error) {
      console.warn('[RedisOpenDayAnalysisCache] SET failed:', error instanceof Error ? error.message : error);
    }
  }
}
