package com.zoomy.api.grpc;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.zoomy.grpc.safebrowser.HostCommand;

import io.grpc.stub.StreamObserver;

/**
 * In-memory registry of connected desktop Safe Agents.
 *
 * <p>Keyed by an opaque {@code agentId} handed out at Connect time. Each session
 * remembers the meeting + user it belongs to and holds the downstream gRPC
 * observer used to push {@link HostCommand}s to the agent. Presence here is what
 * the browser polls to decide whether a candidate may join an interview.
 */
@Component
public class SafeAgentRegistry {

    /** One connected agent session. */
    public static final class AgentSession {
        final String agentId;
        final String meetingId;
        final String userId;
        final String displayName;
        final String participantId;
        volatile StreamObserver<HostCommand> downstream;
        volatile long lastSeen = System.currentTimeMillis();
        volatile int monitorCount;
        volatile String foregroundWindow = "";

        AgentSession(String agentId, String meetingId, String userId, String displayName, String participantId) {
            this.agentId = agentId;
            this.meetingId = meetingId;
            this.userId = userId;
            this.displayName = displayName;
            this.participantId = participantId;
        }

        public String agentId() { return agentId; }
        public String meetingId() { return meetingId; }
        public String userId() { return userId; }
        public String displayName() { return displayName; }
        public long lastSeen() { return lastSeen; }
        public int monitorCount() { return monitorCount; }
    }

    /** Consider an agent stale (gone) after this long without a heartbeat. */
    private static final long STALE_MS = 20_000;

    private final Map<String, AgentSession> byAgentId = new ConcurrentHashMap<>();

    public AgentSession create(String agentId, String meetingId, String userId, String displayName, String participantId) {
        AgentSession s = new AgentSession(agentId, meetingId, userId, displayName, participantId);
        byAgentId.put(agentId, s);
        return s;
    }

    public AgentSession get(String agentId) {
        return agentId == null ? null : byAgentId.get(agentId);
    }

    public void touch(String agentId) {
        AgentSession s = byAgentId.get(agentId);
        if (s != null) s.lastSeen = System.currentTimeMillis();
    }

    public void remove(String agentId) {
        if (agentId != null) byAgentId.remove(agentId);
    }

    /** True when a non-stale agent is connected for this meeting + user. */
    public boolean isConnected(String meetingId, String userId) {
        long now = System.currentTimeMillis();
        return byAgentId.values().stream().anyMatch(s ->
            s.meetingId.equals(meetingId) && s.userId.equals(userId)
            && s.downstream != null && (now - s.lastSeen) < STALE_MS);
    }

    /** Snapshot of the live agent for a meeting+user, or null. */
    public AgentSession find(String meetingId, String userId) {
        long now = System.currentTimeMillis();
        return byAgentId.values().stream()
            .filter(s -> s.meetingId.equals(meetingId) && s.userId.equals(userId) && (now - s.lastSeen) < STALE_MS)
            .findFirst().orElse(null);
    }

    /**
     * Push a command to every live agent in a meeting (target "ALL") or to the
     * agent(s) of a specific user. Returns how many agents received it.
     */
    public int sendCommand(String meetingId, String targetUserId, HostCommand cmd) {
        int sent = 0;
        for (AgentSession s : byAgentId.values()) {
            if (!s.meetingId.equals(meetingId)) continue;
            if (targetUserId != null && !"ALL".equals(targetUserId) && !s.userId.equals(targetUserId)) continue;
            StreamObserver<HostCommand> down = s.downstream;
            if (down == null) continue;
            try {
                synchronized (down) { down.onNext(cmd); }
                sent++;
            } catch (Exception ignored) {
                // Broken stream — it'll be cleaned up on its own error callback.
            }
        }
        return sent;
    }
}
