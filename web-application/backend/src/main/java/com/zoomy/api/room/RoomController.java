package com.zoomy.api.room;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.zoomy.api.common.ApiException;
import com.zoomy.api.meeting.Meeting;
import com.zoomy.api.meeting.MeetingService;

import lombok.RequiredArgsConstructor;

/**
 * Room coordination endpoint for multi-user sync:
 * - join/leave
 * - mic/cam/screen state changes
 * - chat fanout + persistence
 * - full snapshot for reconnect resilience
 */
@RestController
@RequestMapping("/api/meetings/{meetingId}/room")
@RequiredArgsConstructor
public class RoomController {

    private final MeetingService meetings;
    private final RoomStateService room;
    private final RoomChatStore chat;
    private final SimpMessagingTemplate ws;
    private final com.zoomy.api.grpc.SafeAgentRegistry safeAgents;

    @GetMapping("/snapshot")
    public RoomSnapshot snapshot(@PathVariable String meetingId) {
        requireActiveMeeting(meetingId);
        return room.snapshot(meetingId, chat.recent(meetingId, 100));
    }

    @MessageMapping("/room/{meetingId}/join")
    public void join(@DestinationVariable String meetingId,
                     @Header(value = "simpSessionId", required = false) String wsSessionId,
                     @Payload RoomStateService.JoinRequest req,
                     org.springframework.security.core.Authentication auth) {
        if (req == null) throw new ApiException(400, "Join payload is required");
        Meeting m = requireActiveMeeting(meetingId);
        RoomStateService.JoinRequest safeReq = coerceJoin(req, auth, m);
        RoomParticipantState joined = room.join(meetingId, wsSessionId, safeReq);
        meetings.markParticipantJoined(meetingId, joined.userId(), joined.name(), joined.role());

        ws.convertAndSend(
            "/topic/room/" + meetingId + "/events",
            RoomEvent.participantJoined(meetingId, joined, room.participantCount(meetingId))
        );

        // Also push a fresh snapshot so late joiners reconcile quickly.
        ws.convertAndSend("/topic/room/" + meetingId + "/snapshot", room.snapshot(meetingId, chat.recent(meetingId, 50)));
    }

    @MessageMapping("/room/{meetingId}/media")
    public void media(@DestinationVariable String meetingId,
                      @Payload MediaPayload req) {
        if (req == null) throw new ApiException(400, "Media payload is required");
        requireActiveMeeting(meetingId);
        RoomParticipantState updated = room.updateMedia(meetingId, req.participantId(),
            new RoomStateService.MediaUpdateRequest(req.micOn(), req.camOn(), req.screenOn()));
        ws.convertAndSend("/topic/room/" + meetingId + "/events", RoomEvent.mediaUpdated(meetingId, updated));
    }

    @MessageMapping("/room/{meetingId}/chat")
    public void chat(@DestinationVariable String meetingId,
                     @Payload ChatPayload req) {
        if (req == null) throw new ApiException(400, "Chat payload is required");
        requireActiveMeeting(meetingId);
        if (req.fromParticipantId() == null || req.fromParticipantId().isBlank()) {
            throw new ApiException(400, "fromParticipantId is required");
        }
        if (req.text() == null || req.text().isBlank()) throw new ApiException(400, "Message is empty");

        RoomParticipantState sender = room.participant(meetingId, req.fromParticipantId())
            .orElseThrow(() -> new ApiException(403, "Participant is not joined in this room"));

        RoomChatMessage saved = chat.save(meetingId, sender.participantId(), sender.name(), req.text().trim());
        ws.convertAndSend("/topic/room/" + meetingId + "/events", RoomEvent.chat(meetingId, saved));
    }

    /**
     * Relays a proctoring signal (gaze off-screen, no-face, multiple-faces, tab
     * blur, etc.) raised on a participant's own device to everyone in the room.
     * The host UI surfaces these; the server only fans out, it does not judge.
     */
    @MessageMapping("/room/{meetingId}/proctor")
    public void proctor(@DestinationVariable String meetingId,
                        @Payload ProctorRelay req) {
        if (req == null || req.fromParticipantId() == null || req.fromParticipantId().isBlank()) return;
        requireActiveMeeting(meetingId);
        if (room.participant(meetingId, req.fromParticipantId()).isEmpty()) return;
        ws.convertAndSend("/topic/room/" + meetingId + "/proctor", req);
    }

    /**
     * Relays continuous gaze telemetry (a -1..+1 horizontal reading) from a
     * candidate's device to the interviewer's live readout. High-frequency and
     * disposable — not persisted, just fanned out.
     */
    @MessageMapping("/room/{meetingId}/gaze")
    public void gaze(@DestinationVariable String meetingId,
                     @Payload GazeTelemetry req) {
        if (req == null || req.fromParticipantId() == null || req.fromParticipantId().isBlank()) return;
        ws.convertAndSend("/topic/room/" + meetingId + "/gaze", req);
    }

    /**
     * Host/interviewer control command broadcast to participants: force mute,
     * force camera-off, lock chat, force fullscreen, allow AI, push room
     * settings, remove, or end. Each client applies commands addressed to it
     * (target = its participantId or "ALL"). The server only fans out.
     */
    @MessageMapping("/room/{meetingId}/control")
    public void control(@DestinationVariable String meetingId,
                        @Payload RoomControl req) {
        if (req == null || req.kind() == null || req.kind().isBlank()) return;
        requireActiveMeeting(meetingId);
        ws.convertAndSend("/topic/room/" + meetingId + "/control", req);

        // Mirror lockdown-relevant commands to the candidate's desktop Safe Agent.
        String agentKind = switch (req.kind()) {
            case "end" -> "end";
            case "fullscreen" -> "lockdown";
            case "rescan" -> "rescan";
            default -> null;
        };
        if (agentKind != null) {
            safeAgents.sendCommand(meetingId, "ALL",
                com.zoomy.grpc.safebrowser.HostCommand.newBuilder()
                    .setKind(agentKind).setValue(req.value()).build());
        }
    }

    @MessageMapping("/room/{meetingId}/leave")
    public void leave(@DestinationVariable String meetingId,
                      @Payload LeavePayload req) {        if (req == null || req.participantId() == null || req.participantId().isBlank()) {
            throw new ApiException(400, "participantId is required");
        }
        RoomParticipantState left = room.leave(meetingId, req.participantId());
        if (left != null) {
            meetings.markParticipantLeft(meetingId, left.userId());
            ws.convertAndSend(
                "/topic/room/" + meetingId + "/events",
                RoomEvent.participantLeft(meetingId, left, room.participantCount(meetingId))
            );
        }
    }

    private Meeting requireActiveMeeting(String meetingId) {
        Meeting m = meetings.resolve(meetingId);
        if (m.getStatus() != Meeting.Status.ACTIVE) {
            throw new ApiException(409, "Meeting is not active");
        }
        return m;
    }

    private static RoomStateService.JoinRequest coerceJoin(RoomStateService.JoinRequest req,
                                                           org.springframework.security.core.Authentication auth,
                                                           Meeting m) {
        String uid = req.userId();
        if ((uid == null || uid.isBlank()) && auth != null) uid = auth.getName();

        String role = req.role();
        if (role == null || role.isBlank()) {
            role = uid != null && uid.equals(m.getHostId()) ? "HOST" : "GUEST";
        }

        String name = req.name();
        if (name == null || name.isBlank()) {
            name = uid != null && uid.equals(m.getHostId()) ? m.getHostName() : "Participant";
        }

        return new RoomStateService.JoinRequest(
            req.participantId(),
            uid,
            name,
            role,
            req.micOn(),
            req.camOn(),
            req.screenOn()
        );
    }

    public record MediaPayload(String participantId, boolean micOn, boolean camOn, boolean screenOn) {}
    public record ChatPayload(String fromParticipantId, String text) {}
    public record LeavePayload(String participantId) {}
    public record ProctorRelay(String fromParticipantId, String fromName, String source,
                               String kind, String severity, String message, String at) {}
    public record GazeTelemetry(String fromParticipantId, double x, double y,
                                String label, String vlabel, String at) {}
    public record RoomControl(String from, String target, String kind, boolean value, String json) {}
}
