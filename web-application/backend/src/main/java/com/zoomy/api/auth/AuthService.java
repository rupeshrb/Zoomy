package com.zoomy.api.auth;

import java.time.Instant;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.zoomy.api.auth.dto.AuthResponse;
import com.zoomy.api.auth.dto.LoginRequest;
import com.zoomy.api.auth.dto.SignupRequest;
import com.zoomy.api.auth.dto.UserDto;
import com.zoomy.api.common.ApiException;

@Service
public class AuthService {

    private static final String[] COLORS = {
        "#ea4335","#fbbc04","#34a853","#4285f4","#a142f4","#f06292","#26a69a","#ff7043"
    };

    private final UserRepository users;
    private final RefreshTokenRepository tokens;
    private final PasswordEncoder encoder;
    private final JwtService jwt;

    public AuthService(UserRepository users, RefreshTokenRepository tokens,
                       PasswordEncoder encoder, JwtService jwt) {
        this.users = users; this.tokens = tokens; this.encoder = encoder; this.jwt = jwt;
    }

    public AuthResponse signup(SignupRequest req, String ip, String userAgent) {
        String email = req.email().trim().toLowerCase();
        if (users.existsByEmail(email)) {
            throw new ApiException(409, "An account with that email already exists");
        }
        User u = new User();
        u.setEmail(email);
        u.setName(req.name().trim());
        u.setPasswordHash(encoder.encode(req.password()));
        u.setAvatarColor(hashColor(email));
        Set<String> roles = new HashSet<>(); roles.add("USER");
        u.setRoles(roles);
        u.setCreatedAt(Instant.now()); u.setUpdatedAt(Instant.now());
        u = users.save(u);
        return issueTokens(u, ip, userAgent);
    }

    public AuthResponse login(LoginRequest req, String ip, String userAgent) {
        String email = req.email().trim().toLowerCase();
        User u = users.findByEmail(email)
            .orElseThrow(() -> new ApiException(401, "Invalid email or password"));
        if (!u.isEnabled() || !encoder.matches(req.password(), u.getPasswordHash())) {
            throw new ApiException(401, "Invalid email or password");
        }
        return issueTokens(u, ip, userAgent);
    }

    public AuthResponse refresh(String refreshToken, String ip, String userAgent) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new ApiException(401, "Missing refresh token");
        }
        RefreshToken rt = tokens.findByToken(refreshToken)
            .orElseThrow(() -> new ApiException(401, "Invalid refresh token"));
        if (rt.isRevoked() || rt.getExpiresAt().isBefore(Instant.now())) {
            throw new ApiException(401, "Refresh token expired");
        }
        // rotate
        rt.setRevoked(true);
        tokens.save(rt);
        User u = users.findById(rt.getUserId())
            .orElseThrow(() -> new ApiException(401, "Account no longer exists"));
        return issueTokens(u, ip, userAgent);
    }

    public void logout(String refreshToken) {
        if (refreshToken == null) return;
        tokens.findByToken(refreshToken).ifPresent(rt -> {
            rt.setRevoked(true);
            tokens.save(rt);
        });
    }

    public UserDto me(String userId) {
        return users.findById(userId).map(UserDto::from)
            .orElseThrow(() -> new ApiException(401, "Not authenticated"));
    }

    public Optional<User> byId(String id) { return users.findById(id); }

    // ---- helpers ----

    private AuthResponse issueTokens(User u, String ip, String userAgent) {
        String access = jwt.createAccessToken(u);

        RefreshToken rt = new RefreshToken();
        rt.setToken(UUID.randomUUID().toString().replace("-", "")
            + UUID.randomUUID().toString().replace("-", ""));
        rt.setUserId(u.getId());
        rt.setIp(ip); rt.setUserAgent(userAgent);
        rt.setRevoked(false);
        rt.setCreatedAt(Instant.now());
        rt.setExpiresAt(Instant.now().plus(jwt.refreshTtl()));
        tokens.save(rt);

        return new AuthResponse(
            access, rt.getToken(),
            jwt.accessTtl().toSeconds(),
            UserDto.from(u)
        );
    }

    private static String hashColor(String s) {
        int h = 0;
        for (int i = 0; i < s.length(); i++) h = (h * 31 + s.charAt(i)) & 0x7fffffff;
        return COLORS[h % COLORS.length];
    }
}
