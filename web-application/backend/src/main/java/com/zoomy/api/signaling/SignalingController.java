package com.zoomy.api.signaling;

import com.zoomy.api.common.ApiException;
import com.zoomy.api.meeting.Meeting;
import com.zoomy.api.meeting.MeetingService;
import com.zoomy.api.room.RoomStateService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

/**
 * Minimal WebRTC signaling relay. Clients send offer/answer/candidate to
 * /app/signal/{sessionId} and we fan out to /topic/signal/{sessionId}.
 * For >2 participants per room, swap for an SFU (mediasoup/Jitsi/Janus).
 */
@Controller
@Slf4j
public class SignalingController {

    private final SimpMessagingTemplate ws;
    private final MeetingService meetings;
    private final RoomStateService room;

    public SignalingController(SimpMessagingTemplate ws, MeetingService meetings, RoomStateService room) {
        this.ws = ws;
        this.meetings = meetings;
        this.room = room;
    }

    @MessageMapping("/signal/{sessionId}")
    public void signal(@DestinationVariable String sessionId,
                       @Payload SignalMessage msg) {
        ws.convertAndSend("/topic/signal/" + sessionId, msg);
    }

    /**
     * Preferred signaling channel for the current multi-user room model.
     * The backend validates the participant is currently joined in Redis room state.
     */
    @MessageMapping("/room/{meetingId}/signal")
    public void roomSignal(@DestinationVariable String meetingId,
                           @Payload SignalMessage msg) {
        Meeting m = meetings.resolve(meetingId);
        if (m.getStatus() != Meeting.Status.ACTIVE) {
            throw new ApiException(409, "Meeting is not active");
        }
        if (msg == null || msg.from() == null || msg.from().isBlank()) {
            throw new ApiException(400, "Signal payload is invalid");
        }
        if (msg.type() == null || msg.type().isBlank()) {
            throw new ApiException(400, "Signal type is required");
        }
        if (room.participant(meetingId, msg.from()).isEmpty()) {
            throw new ApiException(403, "Participant is not joined in this room");
        }

        ws.convertAndSend("/topic/room/" + meetingId + "/signal", msg);
    }

    public record SignalMessage(String from, String to, String type, Object payload) {}
}
