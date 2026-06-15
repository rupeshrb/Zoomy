package com.zoomy.api.room;

import java.time.Instant;

/**
 * Broadcast event envelope for /topic/room/{meetingId}/events.
 */
public record RoomEvent(
    String type,
    String meetingId,
    Instant at,
    RoomParticipantState participant,
    RoomChatMessage chat,
    Integer participantsCount,
    String note
) {
    public static RoomEvent participantJoined(String meetingId,
                                              RoomParticipantState participant,
                                              int participantsCount) {
        return new RoomEvent(
            "PARTICIPANT_JOINED",
            meetingId,
            Instant.now(),
            participant,
            null,
            participantsCount,
            null
        );
    }

    public static RoomEvent participantLeft(String meetingId,
                                            RoomParticipantState participant,
                                            int participantsCount) {
        return new RoomEvent(
            "PARTICIPANT_LEFT",
            meetingId,
            Instant.now(),
            participant,
            null,
            participantsCount,
            null
        );
    }

    public static RoomEvent mediaUpdated(String meetingId, RoomParticipantState participant) {
        return new RoomEvent(
            "MEDIA_UPDATED",
            meetingId,
            Instant.now(),
            participant,
            null,
            null,
            null
        );
    }

    public static RoomEvent chat(String meetingId, RoomChatMessage msg) {
        return new RoomEvent(
            "CHAT_MESSAGE",
            meetingId,
            Instant.now(),
            null,
            msg,
            null,
            null
        );
    }
}
