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

/**
 * Fail-fast variant for producers on the request path. BullMQ only requires
 * `maxRetriesPerRequest: null` on the connections its *workers* block on; a
 * request handler enqueueing a job must reject quickly instead of queueing
 * commands forever while Redis is down.
 */
export const redisProducerOptions: RedisOptions = {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
};

export const createRedisConnection = (): IORedis =>
    new IORedis(redisConnectionOptions);
