package com.zoomy.api.auth;

import java.security.Key;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;

@Service
public class JwtService {

    private final SecretKey key;
    private final String issuer;
    private final Duration accessTtl;
    private final Duration refreshTtl;

    public JwtService(
            @Value("${zoomy.jwt.secret}") String secret,
            @Value("${zoomy.jwt.issuer}") String issuer,
            @Value("${zoomy.jwt.access-ttl-minutes}") int accessMinutes,
            @Value("${zoomy.jwt.refresh-ttl-days}") int refreshDays
    ) {
        // Accept raw string OR base64-encoded secret. Pad with bytes if too short for HS256.
        byte[] bytes;
        try {
            bytes = Decoders.BASE64.decode(secret);
            if (bytes.length < 32) bytes = secret.getBytes();
        } catch (Exception e) {
            bytes = secret.getBytes();
        }
        if (bytes.length < 32) {
            throw new IllegalStateException("zoomy.jwt.secret must be >= 32 bytes for HS256");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.issuer = issuer;
        this.accessTtl = Duration.ofMinutes(accessMinutes);
        this.refreshTtl = Duration.ofDays(refreshDays);
    }

    public String createAccessToken(User u) {
        Instant now = Instant.now();
        return Jwts.builder()
            .issuer(issuer)
            .subject(u.getId())
            .claim("email", u.getEmail())
            .claim("name", u.getName())
            .claim("roles", u.getRoles())
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(accessTtl)))
            .signWith(key, Jwts.SIG.HS256)
            .compact();
    }

    public Claims parse(String token) throws JwtException {
        return Jwts.parser().verifyWith((SecretKey) (Key) key).build()
            .parseSignedClaims(token).getPayload();
    }

    public Duration accessTtl() { return accessTtl; }
    public Duration refreshTtl() { return refreshTtl; }
}
