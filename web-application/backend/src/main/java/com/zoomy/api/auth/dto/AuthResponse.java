package com.zoomy.api.auth.dto;

public record AuthResponse(
    String accessToken,
    String refreshToken,
    long   expiresInSeconds,
    UserDto user
) {}
