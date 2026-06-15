package com.zoomy.agent;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * Tiny loopback HTTP server the candidate's browser talks to during the
 * interview handshake. The Safe Agent has NO login form — instead the browser
 * (already authenticated) POSTs the session here and the agent connects to the
 * backend on its behalf.
 *
 * <p>Endpoints (CORS-open, loopback only):
 * <ul>
 *   <li>{@code GET  /status}    → {@code {running, connected, version}} — lets the
 *       page detect whether the agent is installed/running.</li>
 *   <li>{@code POST /handshake} → {@code {accessToken, meetingId, name}} → starts
 *       proctoring and returns {@code {ok, agentId, displayName}}.</li>
 * </ul>
 */
public class LocalListener {

    public record Handshake(String accessToken, String meetingId, String name) {}
    public record Result(boolean ok, String agentId, String displayName, String error) {}

    /** Bridges browser handshakes to the agent. */
    public interface Handler {
        Result onHandshake(Handshake h);
        boolean isConnected();
    }

    private final ObjectMapper json = new ObjectMapper();
    private HttpServer server;

    /** Start listening on 127.0.0.1:{port}. Returns the bound port. */
    public int start(int port, Handler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.setExecutor(Executors.newFixedThreadPool(2));

        server.createContext("/status", ex -> {
            if (cors(ex)) return;
            ObjectNode body = json.createObjectNode();
            body.put("running", true);
            body.put("connected", handler.isConnected());
            body.put("version", "0.1.0");
            send(ex, 200, json.writeValueAsString(body));
        });

        server.createContext("/handshake", ex -> {
            if (cors(ex)) return;
            if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
                send(ex, 405, "{\"ok\":false,\"error\":\"POST only\"}");
                return;
            }
            try {
                JsonNode n = json.readTree(ex.getRequestBody());
                Handshake h = new Handshake(text(n, "accessToken"), text(n, "meetingId"), text(n, "name"));
                if (h.accessToken() == null || h.meetingId() == null) {
                    send(ex, 400, "{\"ok\":false,\"error\":\"accessToken and meetingId are required\"}");
                    return;
                }
                Result r = handler.onHandshake(h);
                ObjectNode out = json.createObjectNode();
                out.put("ok", r.ok());
                if (r.agentId() != null) out.put("agentId", r.agentId());
                if (r.displayName() != null) out.put("displayName", r.displayName());
                if (r.error() != null) out.put("error", r.error());
                send(ex, r.ok() ? 200 : 401, json.writeValueAsString(out));
            } catch (Exception e) {
                send(ex, 500, "{\"ok\":false,\"error\":\"" + escape(e.getMessage()) + "\"}");
            }
        });

        server.start();
        return port;
    }

    public void stop() {
        if (server != null) server.stop(0);
    }

    /** Add permissive CORS (loopback only, no credentials); handle the preflight. */
    private boolean cors(HttpExchange ex) throws IOException {
        var h = ex.getResponseHeaders();
        h.add("Access-Control-Allow-Origin", "*");
        h.add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        h.add("Access-Control-Allow-Headers", "Content-Type");
        h.add("Access-Control-Max-Age", "600");
        if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(204, -1);
            ex.close();
            return true;
        }
        return false;
    }

    private void send(HttpExchange ex, int code, String body) throws IOException {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(code, b.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(b); }
    }

    private static String text(JsonNode n, String f) {
        JsonNode v = n.get(f);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
