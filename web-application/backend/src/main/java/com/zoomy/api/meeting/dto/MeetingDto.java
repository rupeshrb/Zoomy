package com.zoomy.api.meeting.dto;

import java.time.Instant;

import com.zoomy.api.meeting.Meeting;

public record MeetingDto(
    String id,
    String code,
    String mode,
    String status,
    String hostId,
    String hostName,
    String title,
    boolean passwordEnabled,
    boolean lobbyEnabled,
    Instant createdAt
) {
    public static MeetingDto from(Meeting m) {
        return new MeetingDto(
            m.getId(), m.getCode(),
            m.getMode().name(), m.getStatus().name(),
            m.getHostId(), m.getHostName(),
            m.getTitle(),
            m.isPasswordEnabled(),
            m.isLobbyEnabled(),
            m.getCreatedAt()
        );
    }
}
