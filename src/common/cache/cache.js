import env from "../config/env.config.js";

/* Key/value cache with TTL: Redis when REDIS_URL is set, else in-process.
   Callers namespace keys by tenant: `tenant:${tenantId}:currentYear`.
   Values are stored as JSON in both stores, so callers get a private copy and
   the same types (dates come back as ISO strings) with or without Redis. */

const memoryStore = () => {
  const entries = new Map();
  return {
    get: async key => {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt < Date.now()) {
        entries.delete(key);
        return undefined;
      }
      return JSON.parse(entry.value);
    },
    set: async (key, value, ttlSeconds) => {
      entries.set(key, { value: JSON.stringify(value), expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    del: async key => {
      entries.delete(key);
    },
    clear: async () => entries.clear()
  };
};

const redisStore = async url => {
  const { default: IORedis } = await import("ioredis");
  const redis = new IORedis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
  return {
    get: async key => {
      const raw = await redis.get(key);
      return raw === null ? undefined : JSON.parse(raw);
    },
    set: async (key, value, ttlSeconds) => {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    },
    del: async key => {
      await redis.del(key);
    },
    clear: async () => {},
    quit: () => redis.quit()
  };
};

let store = memoryStore();

export const initCache = async () => {
  if (env.redisUrl) store = await redisStore(env.redisUrl);
};

export const closeCache = () => store.quit?.();

export const cache = {
  get: key => store.get(key),
  set: (key, value, ttlSeconds = 300) => store.set(key, value, ttlSeconds),
  del: key => store.del(key),
  clear: () => store.clear(),

  /* Read-through: return the cached value or compute, store and return it.
     `null` results are cached too; `undefined` is not. */
  wrap: async (key, ttlSeconds, compute) => {
    const hit = await store.get(key);
    if (hit !== undefined) return hit;
    const value = await compute();
    if (value !== undefined) await store.set(key, value, ttlSeconds);
    return value;
  }
};
