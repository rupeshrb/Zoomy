package com.zoomy.api.common.ratelimit;

import java.io.IOException;

import org.springframework.web.filter.OncePerRequestFilter;

import com.zoomy.api.common.ratelimit.RedisRateLimiter.Decision;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Per-client rate limit for the REST API, enforced before the security chain.
 *
 * <p>Auth endpoints (login/signup/refresh) get a strict bucket to blunt
 * credential-stuffing/brute force; the rest of the API shares a looser bucket.
 * Clients are keyed by the first {@code X-Forwarded-For} hop (behind a proxy)
 * or the socket address. On limit breach it returns 429 with a {@code Retry-After}
 * header and the same JSON error shape used elsewhere.
 */
public class RateLimitFilter extends OncePerRequestFilter {

    private final RedisRateLimiter limiter;
    private final boolean enabled;
    private final int authLimit;
    private final int authWindow;
    private final int apiLimit;
    private final int apiWindow;

    public RateLimitFilter(RedisRateLimiter limiter, boolean enabled,
                           int authLimit, int authWindow, int apiLimit, int apiWindow) {
        this.limiter = limiter;
        this.enabled = enabled;
        this.authLimit = authLimit;
        this.authWindow = authWindow;
        this.apiLimit = apiLimit;
        this.apiWindow = apiWindow;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        if (!enabled) return true;
        if ("OPTIONS".equalsIgnoreCase(req.getMethod())) return true;   // CORS preflight
        String p = req.getServletPath();
        return p == null || !p.startsWith("/api/");                     // only the REST API
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String client = clientIp(req);
        boolean isAuth = req.getServletPath().startsWith("/api/auth/");
        Decision d = isAuth
            ? limiter.check("auth", client, authLimit, authWindow)
            : limiter.check("api", client, apiLimit, apiWindow);

        res.setHeader("X-RateLimit-Limit", String.valueOf(d.limit()));
        res.setHeader("X-RateLimit-Remaining", String.valueOf(d.remaining()));

        if (!d.allowed()) {
            writeTooManyRequests(req, res, d.retryAfterSeconds());
            return;
        }
        chain.doFilter(req, res);
    }

    private void writeTooManyRequests(HttpServletRequest req, HttpServletResponse res, long retryAfter)
            throws IOException {
        res.setStatus(429);
        res.setHeader("Retry-After", String.valueOf(retryAfter));
        res.setContentType("application/json");
        res.setCharacterEncoding("UTF-8");
        String path = req.getRequestURI() == null ? "" : req.getRequestURI().replace("\"", "");
        res.getWriter().write(
            "{\"status\":429,\"error\":\"Too many requests. Please slow down.\",\"path\":\""
                + path + "\",\"retryAfterSeconds\":" + retryAfter + "}");
    }

    private String clientIp(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return req.getRemoteAddr();
    }
}
