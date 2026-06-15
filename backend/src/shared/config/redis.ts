import { RedisOptions } from "ioredis";
import IORedis from "ioredis";
import { env } from "./env";

/**
 * Shared Redis connection config. One source of truth reused by BullMQ workers
 * now and the rate limiter later (per docs/rate-limiting.md — no second pool).
 *
 * BullMQ requires `maxRetriesPerRequest: null` on its connection.
 */
export const redisConnectionOptions: RedisOptions = {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
};

export const createRedisConnection = (): IORedis =>
    new IORedis(redisConnectionOptions);
