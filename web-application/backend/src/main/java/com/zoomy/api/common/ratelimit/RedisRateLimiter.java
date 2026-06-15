package com.zoomy.api.common.ratelimit;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

/**
 * Distributed fixed-window rate limiter backed by Redis.
 *
 * <p>Counting is done atomically in a single Lua round-trip (INCR + EXPIRE on
 * the first hit), so it is correct across multiple backend instances sharing
 * one Redis. Keys are namespaced per bucket and client and auto-expire.
 *
 * <p>It <b>fails open</b>: if Redis is unavailable the request is allowed rather
 * than blocked, and a short cooldown skips Redis entirely so an outage doesn't
 * add latency to every request.
 */
@Service
public class RedisRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RedisRateLimiter.class);

    /** Atomic fixed-window counter; returns {currentCount, ttlSeconds}. */
    private static final String LUA =
        "local current = redis.call('INCR', KEYS[1]) " +
        "if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end " +
        "local ttl = redis.call('TTL', KEYS[1]) " +
        "return {current, ttl}";

    private static final long COOLDOWN_MS = 10_000;

    private final StringRedisTemplate redis;
    @SuppressWarnings("rawtypes")
    private final DefaultRedisScript<List> script;

    /** While Redis is failing, skip it until this timestamp (epoch ms). */
    private volatile long skipRedisUntil = 0;

    @SuppressWarnings({ "rawtypes", "unchecked" })
    public RedisRateLimiter(StringRedisTemplate redis) {
        this.redis = redis;
        this.script = new DefaultRedisScript(LUA, List.class);
    }

    /** Outcome of a rate-limit check. */
    public record Decision(boolean allowed, long limit, long remaining, long retryAfterSeconds) {}

    /**
     * Count this hit against {@code bucket:clientId} within a {@code windowSeconds}
     * window and decide whether it is within {@code limit}.
     */
    public Decision check(String bucket, String clientId, int limit, int windowSeconds) {
        if (System.currentTimeMillis() < skipRedisUntil) {
            return allow(limit);                      // fail open during cooldown
        }
        String key = "rl:" + bucket + ":" + clientId;
        try {
            @SuppressWarnings("unchecked")
            List<Long> res = redis.execute(script, List.of(key), String.valueOf(windowSeconds));
            long count = res != null && !res.isEmpty() && res.get(0) != null ? res.get(0) : 0;
            long ttl = res != null && res.size() > 1 && res.get(1) != null ? res.get(1) : windowSeconds;
            if (count > limit) {
                return new Decision(false, limit, 0, Math.max(ttl, 1));
            }
            return new Decision(true, limit, Math.max(limit - count, 0), Math.max(ttl, 0));
        } catch (Exception e) {
            skipRedisUntil = System.currentTimeMillis() + COOLDOWN_MS;
            log.warn("Rate limiter Redis unavailable ({}); failing open for {}s", e.getMessage(), COOLDOWN_MS / 1000);
            return allow(limit);
        }
    }

    private static Decision allow(int limit) {
        return new Decision(true, limit, limit, 0);
    }
}
