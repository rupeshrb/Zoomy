package com.zoomy.api.room;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import com.zoomy.api.common.ApiException;

/**
 * In-memory room participant state.
 *
 * Keeps media/presence ephemeral and fast for low-latency fanout without an
 * external dependency, so real-time presence works on a plain
 * {@code mvn spring-boot:run} with no Redis/Docker running. State lives for the
 * lifetime of the JVM which matches the scope of a live meeting on a single-node
 * dev/test deployment. For horizontal scale this can be swapped back to a
 * Redis-backed implementation behind the same public API.
 */
@Service
public class RoomStateService {

    /** meetingId -> (participantId -> state) */
    private final Map<String, Map<String, RoomParticipantState>> rooms = new ConcurrentHashMap<>();

    /** wsSessionId -> "meetingId:participantId" */
    private final Map<String, String> wsBindings = new ConcurrentHashMap<>();

    public RoomParticipantState join(String meetingId, String wsSessionId, JoinRequest req) {
        validate(meetingId, req.participantId(), "participantId");
        Instant now = Instant.now();

        RoomParticipantState state = new RoomParticipantState(
            req.participantId(),
            blankTo(req.userId(), req.participantId()),
            blankTo(req.name(), "Participant"),
            blankTo(req.role(), "GUEST"),
            req.micOn() == null || req.micOn(),
            req.camOn() == null || req.camOn(),
            req.screenOn() != null && req.screenOn(),
            now,
            now
        );
        room(meetingId).put(state.participantId(), state);
        bindWs(wsSessionId, meetingId, state.participantId());
        return state;
    }

    public RoomParticipantState updateMedia(String meetingId, String participantId, MediaUpdateRequest req) {
        validate(meetingId, participantId, "participantId");
        RoomParticipantState prev = getState(meetingId, participantId)
            .orElseThrow(() -> new ApiException(404, "Participant not found in room"));
        RoomParticipantState next = prev.withMedia(req.micOn(), req.camOn(), req.screenOn(), Instant.now());
        room(meetingId).put(participantId, next);
        return next;
    }

    public RoomParticipantState leave(String meetingId, String participantId) {
        Map<String, RoomParticipantState> room = rooms.get(meetingId);
        if (room == null) return null;
        RoomParticipantState prev = room.remove(participantId);
        if (room.isEmpty()) rooms.remove(meetingId);
        return prev;
    }

    public RoomParticipantState leaveByWsSession(String wsSessionId) {
        if (wsSessionId == null || wsSessionId.isBlank()) return null;
        String raw = wsBindings.remove(wsSessionId);
        if (raw == null || !raw.contains(":")) return null;

        String[] parts = raw.split(":", 2);
        return leave(parts[0], parts[1]);
    }

    public String meetingIdForWsSession(String wsSessionId) {
        if (wsSessionId == null || wsSessionId.isBlank()) return null;
        String raw = wsBindings.get(wsSessionId);
        if (raw == null || !raw.contains(":")) return null;
        return raw.substring(0, raw.indexOf(':'));
    }

    public RoomSnapshot snapshot(String meetingId, List<RoomChatMessage> recentMessages) {
        List<RoomParticipantState> participants = participants(meetingId);
        participants.sort((a, b) -> a.joinedAt().compareTo(b.joinedAt()));
        return new RoomSnapshot(meetingId, Instant.now(), participants, recentMessages == null ? List.of() : recentMessages);
    }

    public List<RoomParticipantState> participants(String meetingId) {
        Map<String, RoomParticipantState> room = rooms.get(meetingId);
        if (room == null) return new ArrayList<>();
        return new ArrayList<>(room.values());
    }

    public int participantCount(String meetingId) {
        Map<String, RoomParticipantState> room = rooms.get(meetingId);
        return room == null ? 0 : room.size();
    }

    public Optional<RoomParticipantState> participant(String meetingId, String participantId) {
        return getState(meetingId, participantId);
    }

    private Optional<RoomParticipantState> getState(String meetingId, String participantId) {
        Map<String, RoomParticipantState> room = rooms.get(meetingId);
        if (room == null) return Optional.empty();
        return Optional.ofNullable(room.get(participantId));
    }

    private Map<String, RoomParticipantState> room(String meetingId) {
        return rooms.computeIfAbsent(meetingId, k -> new ConcurrentHashMap<>());
    }

    private void bindWs(String wsSessionId, String meetingId, String participantId) {
        if (wsSessionId == null || wsSessionId.isBlank()) return;
        wsBindings.put(wsSessionId, meetingId + ":" + participantId);
    }

    private static String blankTo(String s, String fallback) { return s == null || s.isBlank() ? fallback : s; }

    private static void validate(String meetingId, String value, String field) {
        if (meetingId == null || meetingId.isBlank()) throw new ApiException(400, "meetingId is required");
        if (value == null || value.isBlank()) throw new ApiException(400, field + " is required");
    }

    public record JoinRequest(
        String participantId,
        String userId,
        String name,
        String role,
        Boolean micOn,
        Boolean camOn,
        Boolean screenOn
    ) {}

    public record MediaUpdateRequest(boolean micOn, boolean camOn, boolean screenOn) {}
}
