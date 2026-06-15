package com.zoomy.agent;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zoomy.grpc.safebrowser.AgentEvent;
import com.zoomy.grpc.safebrowser.ClientInfo;
import com.zoomy.grpc.safebrowser.ConnectRequest;
import com.zoomy.grpc.safebrowser.ConnectResponse;
import com.zoomy.grpc.safebrowser.Heartbeat;
import com.zoomy.grpc.safebrowser.HostCommand;
import com.zoomy.grpc.safebrowser.ProctorSignal;
import com.zoomy.grpc.safebrowser.SafeBrowserServiceGrpc;
import com.zoomy.grpc.safebrowser.SystemInsights;

import io.grpc.ManagedChannel;
import io.grpc.netty.shaded.io.grpc.netty.NettyChannelBuilder;
import io.grpc.stub.StreamObserver;

/**
 * Drives the agent lifecycle: REST login → gRPC Connect → bidirectional Session
 * stream, plus the periodic anti-cheat scan + heartbeat. All UI updates are
 * delivered through the supplied callbacks so JavaFX can marshal them onto the
 * application thread.
 */
public class AgentClient {

    private final String restBase;     // e.g. http://localhost:8080
    private final String grpcHost;
    private final int grpcPort;

    private final ProctorScanner scanner = new ProctorScanner();
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();
    private ScheduledExecutorService exec;

    private ManagedChannel channel;
    private StreamObserver<AgentEvent> upstream;
    private final AtomicReference<String> agentId = new AtomicReference<>();
    private volatile boolean running;
    private volatile boolean connected;

    /** Outcome of a connect attempt, returned to the local handshake. */
    public record StartResult(boolean ok, String agentId, String displayName, String message) {}

    /** True while the gRPC session is live (drives the browser join gate). */
    public boolean isConnected() { return connected && running; }

    private Consumer<String> onStatus = s -> {};
    private Consumer<ProctorScanner.Finding> onFinding = f -> {};
    private Consumer<HostCommand> onCommand = c -> {};

    public AgentClient(String restBase, String grpcHost, int grpcPort) {
        this.restBase = restBase;
        this.grpcHost = grpcHost;
        this.grpcPort = grpcPort;
    }

    public void onStatus(Consumer<String> cb) { this.onStatus = cb; }
    public void onFinding(Consumer<ProctorScanner.Finding> cb) { this.onFinding = cb; }
    public void onCommand(Consumer<HostCommand> cb) { this.onCommand = cb; }

    /** Authenticate against the REST API and return a JWT access token. */
    public String login(String email, String password) throws Exception {
        String body = json.writeValueAsString(java.util.Map.of("email", email, "password", password));
        HttpRequest req = HttpRequest.newBuilder(URI.create(restBase + "/api/auth/login"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();

        HttpResponse<String> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofString());
        } catch (java.net.ConnectException | java.net.http.HttpConnectTimeoutException e) {
            throw new IllegalStateException("Cannot reach the server at " + restBase
                + ". Make sure you are online and the meeting is active.");
        }

        int code = res.statusCode();
        if (code / 100 != 2) {
            throw new IllegalStateException(friendlyAuthError(code, res.body()));
        }

        JsonNode node = json.readTree(res.body());
        JsonNode tok = node.get("accessToken");
        if (tok == null || tok.isNull()) throw new IllegalStateException("No access token in the server response");
        return tok.asText();
    }

    /** Turn an auth HTTP error into a clear, human message (prefers the server's). */
    private String friendlyAuthError(int code, String responseBody) {
        // The backend sends { "status", "error", ... }; prefer that message.
        String serverMsg = null;
        try {
            JsonNode n = json.readTree(responseBody);
            if (n.hasNonNull("error")) serverMsg = n.get("error").asText();
        } catch (Exception ignored) { /* non-JSON body */ }

        return switch (code) {
            case 401 -> serverMsg != null ? serverMsg
                : "Wrong email or password. Use the same account you sign in to Zoomy with.";
            case 403 -> "Access denied. This account isn't allowed to join.";
            case 404 -> "Login service not found. Is the backend running and up to date?";
            case 429 -> "Too many attempts. Please wait a minute and try again.";
            case 400 -> serverMsg != null ? serverMsg : "Please enter a valid email and password.";
            default -> (serverMsg != null ? serverMsg : "Login failed") + " (HTTP " + code + ")";
        };
    }

    /** Connect to a meeting and start the proctoring stream. */
    public StartResult start(String accessToken, String meetingId) {
        channel = NettyChannelBuilder.forAddress(grpcHost, grpcPort)
            .usePlaintext()
            .build();

        SafeBrowserServiceGrpc.SafeBrowserServiceBlockingStub blocking =
            SafeBrowserServiceGrpc.newBlockingStub(channel);

        ConnectResponse resp;
        try {
            resp = blocking.connect(ConnectRequest.newBuilder()
                .setAccessToken(accessToken)
                .setMeetingId(meetingId)
                .setClient(ClientInfo.newBuilder()
                    .setOs(System.getProperty("os.name", ""))
                    .setOsVersion(System.getProperty("os.version", ""))
                    .setAppVersion("0.1.0")
                    .setHostname(hostname())
                    .build())
                .build());
        } catch (Exception e) {
            onStatus.accept("Could not reach the proctoring server: " + e.getMessage());
            return new StartResult(false, null, null, "Could not reach the proctoring server");
        }

        if (!resp.getOk()) {
            onStatus.accept("Connect rejected: " + resp.getMessage());
            return new StartResult(false, null, null, resp.getMessage());
        }
        agentId.set(resp.getAgentId());
        connected = true;
        running = true;
        onStatus.accept("Connected as " + resp.getDisplayName() + " — proctoring active");

        SafeBrowserServiceGrpc.SafeBrowserServiceStub async =
            SafeBrowserServiceGrpc.newStub(channel);

        upstream = async.session(new StreamObserver<>() {
            @Override public void onNext(HostCommand cmd) {
                onCommand.accept(cmd);
                switch (cmd.getKind()) {
                    case "end" -> { onStatus.accept("Interview ended by host"); stop(); }
                    case "rescan" -> { onStatus.accept("Environment scan requested by interviewer…"); runScanNow(); }
                    default -> { }
                }
            }
            @Override public void onError(Throwable t) { connected = false; onStatus.accept("Stream error: " + t.getMessage()); }
            @Override public void onCompleted() { connected = false; onStatus.accept("Stream closed"); }
        });

        int heartbeat = Math.max(resp.getHeartbeatSeconds(), 5);
        exec = Executors.newScheduledThreadPool(2);
        // Heartbeat keeps presence fresh for the browser join gate.
        exec.scheduleAtFixedRate(this::sendHeartbeat, 0, heartbeat, TimeUnit.SECONDS);
        // Continuous anti-cheat scan + system insights.
        exec.scheduleAtFixedRate(this::scanAndReport, 1, 4, TimeUnit.SECONDS);
        // Immediate baseline scan at interview start, so the interviewer gets an
        // instant clean/detected verdict the moment the agent connects.
        exec.schedule(this::runScanNow, 700, TimeUnit.MILLISECONDS);
        return new StartResult(true, resp.getAgentId(), resp.getDisplayName(), "Proctoring active");
    }

    /**
     * Run an immediate, on-demand environment scan (interviewer pressed "Scan
     * now") and report a clear clean/detected result up the channel.
     */
    public void runScanNow() {
        if (!running || upstream == null) return;
        try {
            List<ProctorScanner.Finding> findings = scanner.scanNow();
            if (findings.isEmpty()) {
                onFinding.accept(new ProctorScanner.Finding("ENV_SCAN_CLEAN", "INFO", "No cheat detected"));
                report("ENV_SCAN_CLEAN", "INFO", "Environment scan complete — no hidden overlays or cheat tools detected.");
            } else {
                for (ProctorScanner.Finding f : findings) {
                    onFinding.accept(f);
                    report(f.kind(), f.severity(), f.message());
                }
                report("ENV_SCAN_DETECTED", "CRITICAL",
                    findings.size() + " cheat signal(s) detected during the environment scan.");
            }
        } catch (Exception e) {
            onStatus.accept("Scan failed: " + e.getMessage());
        }
    }

    /** Emit a single proctor signal upstream. */
    private void report(String kind, String severity, String message) {
        if (upstream == null) return;
        synchronized (upstream) {
            upstream.onNext(AgentEvent.newBuilder()
                .setAgentId(agentId.get())
                .setSignal(ProctorSignal.newBuilder()
                    .setKind(kind).setSeverity(severity).setMessage(message)
                    .setTs(System.currentTimeMillis()).build())
                .build());
        }
    }

    private void sendHeartbeat() {
        if (!running || upstream == null) return;
        try {
            synchronized (upstream) {
                upstream.onNext(AgentEvent.newBuilder()
                    .setAgentId(agentId.get())
                    .setHeartbeat(Heartbeat.newBuilder().setTs(System.currentTimeMillis()).build())
                    .build());
            }
        } catch (Exception e) { onStatus.accept("Heartbeat failed: " + e.getMessage()); }
    }

    private void scanAndReport() {
        if (!running || upstream == null) return;
        try {
            for (ProctorScanner.Finding f : scanner.scanWindows()) {
                onFinding.accept(f);
                report(f.kind(), f.severity(), f.message());
            }
            synchronized (upstream) {
                upstream.onNext(AgentEvent.newBuilder()
                    .setAgentId(agentId.get())
                    .setInsights(SystemInsights.newBuilder()
                        .setMonitorCount(scanner.monitorCount())
                        .setTs(System.currentTimeMillis()).build())
                    .build());
            }
        } catch (Exception e) { onStatus.accept("Scan failed: " + e.getMessage()); }
    }

    public void stop() {
        running = false;
        connected = false;
        try { if (upstream != null) upstream.onCompleted(); } catch (Exception ignored) { }
        if (exec != null) exec.shutdownNow();
        if (channel != null) channel.shutdownNow();
        onStatus.accept("Disconnected");
    }

    private static String hostname() {
        try { return java.net.InetAddress.getLocalHost().getHostName(); }
        catch (Exception e) { return "unknown"; }
    }
}
