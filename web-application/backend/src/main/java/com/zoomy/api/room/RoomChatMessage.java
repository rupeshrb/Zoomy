package com.zoomy.api.room;

import java.time.Instant;

public record RoomChatMessage(
    String id,
    String meetingId,
    String fromParticipantId,
    String fromName,
    String text,
    Instant at
) {}
