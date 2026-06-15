package com.zoomy.api.room;

import java.time.Instant;

/**
 * Authoritative per-participant media/presence state for one room.
 * This is what clients should mirror for mic/cam/screen status.
 */
public record RoomParticipantState(
    String participantId,
    String userId,
    String name,
    String role,
    boolean micOn,
    boolean camOn,
    boolean screenOn,
    Instant joinedAt,
    Instant lastSeenAt
) {
    public RoomParticipantState withMedia(boolean micOn, boolean camOn, boolean screenOn, Instant now) {
        return new RoomParticipantState(
            participantId, userId, name, role,
            micOn, camOn, screenOn,
            joinedAt, now
        );
    }

    public RoomParticipantState touch(Instant now) {
        return new RoomParticipantState(
            participantId, userId, name, role,
            micOn, camOn, screenOn,
            joinedAt, now
        );
    }

    public RoomParticipantState withIdentity(String name, String role, Instant now) {
        return new RoomParticipantState(
            participantId, userId,
            name == null || name.isBlank() ? this.name : name,
            role == null || role.isBlank() ? this.role : role,
            micOn, camOn, screenOn,
            joinedAt, now
        );
    }
}
