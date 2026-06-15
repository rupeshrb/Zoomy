package com.zoomy.api.grpc;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import com.zoomy.api.auth.JwtService;
import com.zoomy.api.grpc.SafeAgentRegistry.AgentSession;
import com.zoomy.grpc.safebrowser.AgentEvent;
import com.zoomy.grpc.safebrowser.ConnectRequest;
import com.zoomy.grpc.safebrowser.ConnectResponse;
import com.zoomy.grpc.safebrowser.HostCommand;
import com.zoomy.grpc.safebrowser.ProctorSignal;
import com.zoomy.grpc.safebrowser.SafeBrowserServiceGrpc;
import com.zoomy.grpc.safebrowser.SystemInsights;

import io.grpc.stub.StreamObserver;
import io.jsonwebtoken.Claims;
import net.devh.boot.grpc.server.service.GrpcService;

/**
 * gRPC endpoint for the desktop Safe Agent (JavaFX anti-cheat companion).
 *
 * <p>Authenticates the agent with the same JWT the browser uses, then keeps a
 * bidirectional stream open: anti-cheat findings + heartbeats + system insights
 * flow up and are bridged onto the meeting's STOMP proctor topic so the host UI
 * shows them live; host commands flow back down to the agent.
 */
@GrpcService
public class SafeBrowserGrpcService extends SafeBrowserServiceGrpc.SafeBrowserServiceImplBase {

    private static final Logger log = LoggerFactory.getLogger(SafeBrowserGrpcService.class);
    private static final int HEARTBEAT_SECONDS = 8;

    private final JwtService jwt;
    private final SafeAgentRegistry registry;
    private final SimpMessagingTemplate ws;

    public SafeBrowserGrpcService(JwtService jwt, SafeAgentRegistry registry, SimpMessagingTemplate ws) {
        this.jwt = jwt;
        this.registry = registry;
        this.ws = ws;
    }

    @Override
    public void connect(ConnectRequest req, StreamObserver<ConnectResponse> out) {
        String userId;
        String name;
        try {
            Claims c = jwt.parse(req.getAccessToken());
            userId = c.getSubject();
            Object n = c.get("name");
            name = n != null ? n.toString() : "Candidate";
        } catch (Exception e) {
            out.onNext(ConnectResponse.newBuilder()
                .setOk(false).setMessage("Invalid or expired token").build());
            out.onCompleted();
            return;
        }
        if (req.getMeetingId() == null || req.getMeetingId().isBlank()) {
            out.onNext(ConnectResponse.newBuilder().setOk(false).setMessage("meeting_id is required").build());
            out.onCompleted();
            return;
        }

        String agentId = UUID.randomUUID().toString();
        registry.create(agentId, req.getMeetingId(), userId, name, req.getParticipantId());
        log.info("Safe Agent connected: agentId={} meeting={} user={} os={}",
            agentId, req.getMeetingId(), userId, req.getClient().getOs());

        out.onNext(ConnectResponse.newBuilder()
            .setOk(true)
            .setAgentId(agentId)
            .setUserId(userId)
            .setDisplayName(name)
            .setMessage("Proctoring active")
            .setHeartbeatSeconds(HEARTBEAT_SECONDS)
            .build());
        out.onCompleted();
    }

    @Override
    public StreamObserver<AgentEvent> session(StreamObserver<HostCommand> downstream) {
        return new StreamObserver<>() {
            private String agentId;

            @Override
            public void onNext(AgentEvent ev) {
                if (agentId == null) {
                    agentId = ev.getAgentId();
                    AgentSession s = registry.get(agentId);
                    if (s == null) {
                        downstream.onError(io.grpc.Status.UNAUTHENTICATED
                            .withDescription("Unknown agent; call Connect first").asRuntimeException());
                        return;
                    }
                    s.downstream = downstream;
                    log.debug("Safe Agent session bound: agentId={}", agentId);
                }
                AgentSession s = registry.get(agentId);
                if (s == null) return;
                registry.touch(agentId);

                switch (ev.getEventCase()) {
                    case HEARTBEAT -> { /* lastSeen already touched */ }
                    case SIGNAL -> bridgeSignal(s, ev.getSignal());
                    case INSIGHTS -> handleInsights(s, ev.getInsights());
                    case EVENT_NOT_SET -> { /* ignore */ }
                }
            }

            @Override
            public void onError(Throwable t) {
                notifyDisconnected();
                if (agentId != null) registry.remove(agentId);
            }

            @Override
            public void onCompleted() {
                notifyDisconnected();
                if (agentId != null) registry.remove(agentId);
                try { downstream.onCompleted(); } catch (Exception ignored) { }
            }

            /** Tell the room (interviewer) that this candidate's Safe Agent dropped. */
            private void notifyDisconnected() {
                if (agentId == null) return;
                AgentSession s = registry.get(agentId);
                if (s == null) return;
                emitProctor(s, "AGENT_DISCONNECTED", "CRITICAL",
                    "Safe Agent closed or lost connection. Proctoring is paused until the candidate reopens it.");
            }
        };
    }

    /** Forward an anti-cheat finding onto the meeting's STOMP proctor topic. */
    private void bridgeSignal(AgentSession s, ProctorSignal sig) {
        emitProctor(s, sig.getKind(), sig.getSeverity(), sig.getMessage());
    }

    /** Derive a proctor signal from system insights (e.g. extra monitors). */
    private void handleInsights(AgentSession s, SystemInsights ins) {
        int prev = s.monitorCount;
        s.monitorCount = ins.getMonitorCount();
        if (ins.getMonitorCount() > 1 && prev <= 1) {
            emitProctor(s, "MULTIPLE_MONITORS", "WARN",
                ins.getMonitorCount() + " displays detected on the candidate machine");
        }
    }

    private void emitProctor(AgentSession s, String kind, String severity, String message) {
        Map<String, Object> body = new HashMap<>();
        body.put("fromParticipantId", s.participantId != null ? s.participantId : s.userId());
        body.put("fromName", s.displayName());
        body.put("source", "SAFE_BROWSER");
        body.put("kind", kind);
        body.put("severity", severity == null || severity.isBlank() ? "WARN" : severity);
        body.put("message", message);
        body.put("at", java.time.Instant.now().toString());
        ws.convertAndSend("/topic/room/" + s.meetingId() + "/proctor", body);
    }
}
