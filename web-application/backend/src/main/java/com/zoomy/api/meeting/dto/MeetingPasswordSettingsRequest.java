package com.zoomy.api.meeting.dto;

public record MeetingPasswordSettingsRequest(
    boolean enabled,
    String password
) {}
