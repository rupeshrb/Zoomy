package com.zoomy.api.room;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import lombok.RequiredArgsConstructor;

/**
 * Defensive cleanup: if browser/tab closes without sending explicit leave,
 * we still evict the participant and broadcast PARTICIPANT_LEFT.
 */
@Component
@RequiredArgsConstructor
public class RoomWsSessionListener {

    private final RoomStateService room;
    private final com.zoomy.api.meeting.MeetingService meetings;
    private final SimpMessagingTemplate ws;

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        String wsSessionId = event.getSessionId();
        String meetingId = room.meetingIdForWsSession(wsSessionId);
        RoomParticipantState left = room.leaveByWsSession(wsSessionId);
        if (meetingId == null || left == null) return;

        meetings.markParticipantLeft(meetingId, left.userId());

        ws.convertAndSend(
            "/topic/room/" + meetingId + "/events",
            RoomEvent.participantLeft(meetingId, left, room.participantCount(meetingId))
        );
    }
}
