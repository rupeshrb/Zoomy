package com.zoomy.api.room;

import java.time.Instant;
import java.util.List;

/**
 * Full room snapshot for initial sync / re-sync after reconnect.
 */
public record RoomSnapshot(
    String meetingId,
    Instant generatedAt,
    List<RoomParticipantState> participants,
    List<RoomChatMessage> recentMessages
) {}
