package com.zoomy.api.auth.dto;

import java.util.Set;

import com.zoomy.api.auth.User;

public record UserDto(
    String id,
    String email,
    String name,
    String avatarColor,
    Set<String> roles
) {
    public static UserDto from(User u) {
        return new UserDto(u.getId(), u.getEmail(), u.getName(), u.getAvatarColor(), u.getRoles());
    }
}
