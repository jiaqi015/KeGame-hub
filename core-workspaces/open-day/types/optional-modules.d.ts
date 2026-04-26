declare module 'redis' {
  interface RedisClientOptions {
    url?: string;
    socket?: {
      reconnectStrategy?: (retries: number) => number | Error;
    };
  }

  interface RedisClient {
    connect(): Promise<void>;
    get(key: string): Promise<string | null>;
    setEx(key: string, seconds: number, value: string): Promise<string>;
    isReady?: boolean;
    on(event: string, callback: (err: Error) => void): void;
  }

  export function createClient(options?: RedisClientOptions): RedisClient;
}

declare module 'duckdb' {
  interface Database {
    new (path: string): Database;
    all(query: string, callback: (err: Error | null, result: any[]) => void): void;
    run(query: string, callback?: (err: Error | null) => void): void;
  }

  export const Database: {
    new (path: string): Database;
  };
}
