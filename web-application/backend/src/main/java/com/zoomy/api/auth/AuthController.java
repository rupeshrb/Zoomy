package com.zoomy.api.auth;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.zoomy.api.auth.dto.AuthResponse;
import com.zoomy.api.auth.dto.LoginRequest;
import com.zoomy.api.auth.dto.RefreshRequest;
import com.zoomy.api.auth.dto.SignupRequest;
import com.zoomy.api.auth.dto.UserDto;
import com.zoomy.api.common.ApiException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) { this.auth = auth; }

    @PostMapping("/signup")
    public AuthResponse signup(@Valid @RequestBody SignupRequest req, HttpServletRequest http) {
        return auth.signup(req, http.getRemoteAddr(), http.getHeader("User-Agent"));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
        return auth.login(req, http.getRemoteAddr(), http.getHeader("User-Agent"));
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(@RequestBody RefreshRequest req, HttpServletRequest http) {
        return auth.refresh(req.refreshToken(), http.getRemoteAddr(), http.getHeader("User-Agent"));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestBody(required = false) RefreshRequest req) {
        if (req != null) auth.logout(req.refreshToken());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public UserDto me(Authentication authentication) {
        if (authentication == null || authentication.getPrincipal() == null) {
            throw new ApiException(401, "Not authenticated");
        }
        return auth.me(authentication.getPrincipal().toString());
    }
}
