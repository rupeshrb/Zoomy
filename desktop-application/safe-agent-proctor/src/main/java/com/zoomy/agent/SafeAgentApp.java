package com.zoomy.agent;

import java.io.IOException;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

import javafx.application.Application;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.geometry.Rectangle2D;
import javafx.scene.Scene;
import javafx.scene.SnapshotParameters;
import javafx.scene.canvas.Canvas;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ListCell;
import javafx.scene.control.ListView;
import javafx.scene.effect.DropShadow;
import javafx.scene.image.Image;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Pane;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.scene.shape.Circle;
import javafx.scene.shape.Rectangle;
import javafx.stage.Screen;
import javafx.stage.Stage;

import com.sun.jna.Native;
import com.sun.jna.WString;
import com.sun.jna.win32.W32APIOptions;

/**
 * Zoomy Safe Agent — a lightweight, always-on-top desktop companion that proves
 * to the interview backend (over gRPC) that anti-cheat monitoring is running,
 * while the candidate takes the meeting in their normal browser.
 *
 * <p>There is NO login here. The agent runs a loopback listener; the candidate's
 * already-authenticated browser hands off the session via a local handshake.
 * If the session drops, a Reconnect button rejoins the same meeting.
 */
public class SafeAgentApp extends Application {

    private static final DateTimeFormatter T = DateTimeFormatter.ofPattern("HH:mm:ss");

    // Google Meet / Zoomy palette (light app surfaces)
    private static final String PRIMARY  = "#1a73e8";
    private static final String TEXT     = "#1f2230";
    private static final String MUTED    = "#5f6368";
    private static final String SURFACE  = "#ffffff";
    private static final String GOOD     = "#188038";
    private static final String WARN     = "#f9ab00";
    private static final String BAD      = "#d93025";
    // Console (GitHub-dark inspired)
    private static final String CON_BG   = "#0d1117";
    private static final String CON_BAR  = "#161b22";
    private static final String MONO     = "'Cascadia Mono','Consolas','Courier New',monospace";

    // Override with -Dzoomy.api=... / -Dzoomy.grpcHost=... / -Dzoomy.grpcPort=... / -Dzoomy.agentPort=...
    private final String restBase = System.getProperty("zoomy.api", "http://localhost:8080");
    private final String grpcHost = System.getProperty("zoomy.grpcHost", "localhost");
    private final int grpcPort = Integer.getInteger("zoomy.grpcPort", 9090);
    private final int agentPort = Integer.getInteger("zoomy.agentPort", 7070);

    private AgentClient client;
    private LocalListener listener;
    private volatile boolean connected;
    /** Last accepted handshake — used to rejoin the same meeting after a drop. */
    private volatile LocalListener.Handshake lastHandshake;

    private final Region statusDot = new Region();
    private final Label status = new Label("Waiting for your interview\u2026");
    private final Label connPill = new Label("\u25CF  Waiting");
    private final Label scanResult = new Label("Environment scan: not run yet");
    private final Label statsLabel = new Label("Signals: 0");
    private final Button reconnectBtn = new Button("Reconnect to interview");

    /** Console severity → colors. */
    private enum Sev {
        SYS("#6e7681", "#c9d1d9"), INFO("#58a6ff", "#c9d1d9"),
        GOOD("#3fb950", "#aff5b4"), WARN("#d29922", "#f0d58c"), BAD("#f85149", "#ffb3ae");
        final String dot, text;
        Sev(String dot, String text) { this.dot = dot; this.text = text; }
    }
    private record LogEntry(String time, Sev sev, String text) {}
    private final ObservableList<LogEntry> logItems = FXCollections.observableArrayList();
    private final ListView<LogEntry> console = new ListView<>(logItems);
    private final Label lineCount = new Label("0 lines");
    private int signalCount;

    @Override
    public void start(Stage stage) {
        VBox root = new VBox(16, buildHeader(), buildStatusCard(), reconnectBtn, buildWarnCard(), buildConsole());
        root.setPadding(new Insets(20));
        root.setStyle("-fx-background-color: linear-gradient(to bottom, #ffffff 0%, #eef2fb 100%);");
        root.setPrefSize(460, 600);
        root.setMinSize(440, 480);

        stage.setTitle("Zoomy Safe Agent");
        stage.setScene(new Scene(root));
        stage.setAlwaysOnTop(true);
        stage.setMaximized(false);
        addWindowIcons(stage);
        sizeAndCenter(stage);
        stage.setOnCloseRequest(e -> shutdown());
        stage.show();

        startListener();
    }

    /**
     * Pick a compact window size and centre it. Crucially we CAP the height to a
     * fraction of the screen's visual bounds so the agent never opens looking
     * like it's full-screen on high-DPI / shorter displays.
     */
    private void sizeAndCenter(Stage stage) {
        Rectangle2D vb = Screen.getPrimary().getVisualBounds();
        double w = Math.min(460, vb.getWidth() * 0.9);
        double h = Math.min(600, vb.getHeight() * 0.85);
        stage.setWidth(w);
        stage.setHeight(h);
        stage.setX(vb.getMinX() + (vb.getWidth() - w) / 2);
        stage.setY(vb.getMinY() + Math.max(0, (vb.getHeight() - h) / 2));
    }

    // ---- UI sections ----

    private HBox buildHeader() {
        StackPane logoTile = new StackPane(zoomyLogo(30));
        logoTile.setMinSize(48, 48);
        logoTile.setMaxSize(48, 48);
        logoTile.setStyle("-fx-background-color: " + SURFACE + "; -fx-background-radius: 12;");
        softShadow(logoTile, 0.10, 12);

        Label title = new Label("Zoomy Safe Agent");
        title.setStyle("-fx-font-size: 19px; -fx-font-weight: 800; -fx-text-fill: " + TEXT + ";");
        Label sub = new Label("Anti-cheat monitoring for your interview");
        sub.setWrapText(true);
        sub.setStyle("-fx-text-fill: " + MUTED + "; -fx-font-size: 12px;");
        VBox titleBox = new VBox(1, title, sub);
        titleBox.setAlignment(Pos.CENTER_LEFT);
        titleBox.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        connPill.setStyle(pillStyle(WARN));
        connPill.setMinWidth(Region.USE_PREF_SIZE);

        HBox header = new HBox(14, logoTile, titleBox, connPill);
        header.setAlignment(Pos.CENTER_LEFT);
        return header;
    }

    private VBox buildStatusCard() {
        statusDot.setMinSize(14, 14);
        statusDot.setMaxSize(14, 14);
        paintDot(WARN);
        status.setStyle("-fx-font-weight: 700; -fx-font-size: 15px; -fx-text-fill: " + TEXT + ";");
        status.setWrapText(true);
        HBox statusRow = new HBox(10, statusDot, status);
        statusRow.setAlignment(Pos.CENTER_LEFT);
        HBox.setHgrow(status, Priority.ALWAYS);

        scanResult.setStyle("-fx-text-fill: " + MUTED + "; -fx-font-size: 12px;");
        statsLabel.setStyle("-fx-text-fill: #9aa0a6; -fx-font-size: 11px;");

        VBox card = new VBox(10, statusRow, divider(), scanResult, statsLabel);
        card.setStyle("-fx-background-color: " + SURFACE + "; -fx-background-radius: 16; -fx-padding: 18;");
        softShadow(card, 0.08, 16);
        return card;
    }

    private VBox buildWarnCard() {
        Label warnTitle = new Label("\u26A0  Keep this window open");
        warnTitle.setStyle("-fx-font-weight: 700; -fx-text-fill: #9a6700; -fx-font-size: 13px;");
        Label warnBody = new Label(
            "Do not close the Safe Agent until your interview ends. If you close it, "
            + "your interviewer is notified and you'll be asked to reconnect.");
        warnBody.setWrapText(true);
        warnBody.setMinHeight(Region.USE_PREF_SIZE);
        warnBody.setStyle("-fx-text-fill: #7a5b00; -fx-font-size: 12px;");
        VBox warnCard = new VBox(4, warnTitle, warnBody);
        warnCard.setMinHeight(Region.USE_PREF_SIZE);
        warnCard.setStyle("-fx-background-color: #fff8e1; -fx-background-radius: 14; -fx-padding: 14; "
            + "-fx-border-color: #f7e3a1; -fx-border-radius: 14; -fx-border-width: 1;");

        reconnectBtn.setMaxWidth(Double.MAX_VALUE);
        reconnectBtn.setStyle(primaryButtonStyle());
        reconnectBtn.setOnMouseEntered(e -> reconnectBtn.setStyle(primaryButtonStyle() + "-fx-opacity:.92;"));
        reconnectBtn.setOnMouseExited(e -> reconnectBtn.setStyle(primaryButtonStyle()));
        reconnectBtn.setOnAction(e -> reconnect());
        reconnectBtn.setVisible(false);
        reconnectBtn.setManaged(false);
        return warnCard;
    }

    /** A dark, terminal-style activity console. */
    private VBox buildConsole() {
        HBox lights = new HBox(6, dotCircle("#ff5f56"), dotCircle("#ffbd2e"), dotCircle("#27c93f"));
        lights.setAlignment(Pos.CENTER_LEFT);
        Label conTitle = new Label("activity \u00B7 zoomy-safe-agent");
        conTitle.setStyle("-fx-text-fill: #8b949e; -fx-font-family: " + MONO + "; -fx-font-size: 11px;");
        Region s = new Region();
        HBox.setHgrow(s, Priority.ALWAYS);
        lineCount.setStyle("-fx-text-fill: #6e7681; -fx-font-family: " + MONO + "; -fx-font-size: 11px;");
        HBox bar = new HBox(10, lights, conTitle, s, lineCount);
        bar.setAlignment(Pos.CENTER_LEFT);
        bar.setPadding(new Insets(8, 12, 8, 12));
        bar.setStyle("-fx-background-color: " + CON_BAR + "; -fx-background-radius: 12 12 0 0;");

        console.setFocusTraversable(false);
        console.setStyle("-fx-background-color: transparent; -fx-control-inner-background: transparent; "
            + "-fx-background-insets: 0; -fx-padding: 4;");
        console.setCellFactory(lv -> consoleCell());
        VBox.setVgrow(console, Priority.ALWAYS);
        console.setPrefHeight(150);
        console.setMinHeight(110);

        // Inner panel carries the dark fill + a rounded clip so BOTH bottom
        // corners are curved (the bar already rounds the top two).
        VBox inner = new VBox(bar, console);
        inner.setStyle("-fx-background-color: " + CON_BG + "; -fx-background-radius: 12;");
        Rectangle clip = new Rectangle();
        clip.setArcWidth(24);
        clip.setArcHeight(24);
        clip.widthProperty().bind(inner.widthProperty());
        clip.heightProperty().bind(inner.heightProperty());
        inner.setClip(clip);

        // Outer wrapper keeps the (unclipped) drop shadow around the rounded panel.
        StackPane box = new StackPane(inner);
        box.setStyle("-fx-background-color: transparent;");
        softShadow(box, 0.14, 16);
        VBox.setVgrow(box, Priority.ALWAYS);
        VBox wrap = new VBox(box);
        VBox.setVgrow(box, Priority.ALWAYS);
        VBox.setVgrow(wrap, Priority.ALWAYS);
        return wrap;
    }

    private ListCell<LogEntry> consoleCell() {
        ListCell<LogEntry> cell = new ListCell<>() {
            @Override protected void updateItem(LogEntry e, boolean empty) {
                super.updateItem(e, empty);
                if (empty || e == null) { setText(null); setGraphic(null); setStyle("-fx-background-color: transparent;"); return; }
                Label time = new Label(e.time());
                time.setMinWidth(64);
                time.setStyle("-fx-text-fill: #6e7681; -fx-font-family: " + MONO + "; -fx-font-size: 12px;");
                Label dot = new Label("\u203A");
                dot.setStyle("-fx-text-fill: " + e.sev().dot + "; -fx-font-family: " + MONO + "; -fx-font-size: 13px; -fx-font-weight: bold;");
                Label msg = new Label(e.text());
                msg.setWrapText(true);
                msg.setStyle("-fx-text-fill: " + e.sev().text + "; -fx-font-family: " + MONO + "; -fx-font-size: 12px;");
                HBox.setHgrow(msg, Priority.ALWAYS);
                HBox row = new HBox(8, time, dot, msg);
                row.setAlignment(Pos.TOP_LEFT);
                setGraphic(row);
                setStyle("-fx-background-color: transparent; -fx-padding: 1 6;");
            }
        };
        // Pin each cell to the list viewport width so messages wrap (no horizontal scrollbar).
        cell.prefWidthProperty().bind(console.widthProperty().subtract(24));
        cell.setMaxWidth(Region.USE_PREF_SIZE);
        return cell;
    }

    // ---- branding ----

    /** The Zoomy 2x2 rounded-square mark for on-screen display (lives in a scene). */
    private Pane zoomyLogo(double size) {
        double d = size * 0.44;
        double gap = size - 2 * d;
        Pane p = new Pane();
        p.setMinSize(size, size);
        p.setPrefSize(size, size);
        p.setMaxSize(size, size);
        p.getChildren().addAll(
            logoDot(d, "#4285f4", 0, 0),
            logoDot(d, "#ea4335", d + gap, 0),
            logoDot(d, "#34a853", 0, d + gap),
            logoDot(d, "#fbbc04", d + gap, d + gap));
        return p;
    }

    private Rectangle logoDot(double d, String color, double x, double y) {
        Rectangle r = new Rectangle(d, d);
        r.setArcWidth(d * 0.55);
        r.setArcHeight(d * 0.55);
        r.setFill(Color.web(color));
        r.setLayoutX(x);
        r.setLayoutY(y);
        return r;
    }

    /**
     * Load the committed Zoomy PNG and register it at several sizes so Windows
     * has a crisp bitmap for the title bar AND the taskbar (the previous
     * Canvas-snapshot route produced a blank/soft icon on some machines). Falls
     * back to the vector-drawn mark if the resource is somehow missing.
     */
    private void addWindowIcons(Stage stage) {
        int[] sizes = { 16, 20, 24, 32, 40, 48, 64, 128, 256 };
        boolean loaded = false;
        for (int s : sizes) {
            try (var in = SafeAgentApp.class.getResourceAsStream("/zoomy-logo.png")) {
                if (in != null) {
                    stage.getIcons().add(new Image(in, s, s, true, true));
                    loaded = true;
                }
            } catch (Exception ignored) {
                // try the next size / fall back below
            }
        }
        if (!loaded) {
            for (int s : new int[] { 16, 24, 32, 48, 64, 128 }) stage.getIcons().add(logoIcon(s));
        }
    }

    /**
     * Build the Zoomy mark as a raster Image via a Canvas. A Canvas renders
     * immediately (no scene/layout pass needed), so the snapshot is non-blank —
     * unlike snapshotting an unattached Pane, which yields an empty icon and is
     * why the title bar / taskbar showed no logo before.
     */
    private Image logoIcon(int size) {
        Canvas c = new Canvas(size, size);
        GraphicsContext g = c.getGraphicsContext2D();
        double pad = size * 0.08;
        double avail = size - 2 * pad;
        double gap = avail * 0.12;
        double d = (avail - gap) / 2.0;
        double arc = d * 0.55;
        double x0 = pad, x1 = pad + d + gap, y0 = pad, y1 = pad + d + gap;
        g.setFill(Color.web("#4285f4")); g.fillRoundRect(x0, y0, d, d, arc, arc);
        g.setFill(Color.web("#ea4335")); g.fillRoundRect(x1, y0, d, d, arc, arc);
        g.setFill(Color.web("#34a853")); g.fillRoundRect(x0, y1, d, d, arc, arc);
        g.setFill(Color.web("#fbbc04")); g.fillRoundRect(x1, y1, d, d, arc, arc);
        SnapshotParameters sp = new SnapshotParameters();
        sp.setFill(Color.TRANSPARENT);
        return c.snapshot(sp, null);
    }

    private Circle dotCircle(String color) {
        Circle c = new Circle(6);
        c.setFill(Color.web(color));
        return c;
    }

    /** A hairline divider used inside the status card. */
    private Region divider() {
        Region r = new Region();
        r.setMinHeight(1); r.setPrefHeight(1); r.setMaxHeight(1);
        r.setStyle("-fx-background-color: #eceff4;");
        return r;
    }

    private void softShadow(Region node, double alpha, double radius) {
        DropShadow ds = new DropShadow();
        ds.setColor(Color.web("#0b1f44", alpha));
        ds.setRadius(radius);
        ds.setOffsetY(3);
        node.setEffect(ds);
    }

    private String primaryButtonStyle() {
        return "-fx-background-color: " + PRIMARY + "; -fx-text-fill: white; -fx-font-size: 14px; "
            + "-fx-font-weight: 700; -fx-background-radius: 12; -fx-padding: 13 18; -fx-cursor: hand;";
    }

    private String pillStyle(String color) {
        return "-fx-text-fill: " + color + "; -fx-font-size: 12px; -fx-font-weight: 700; "
            + "-fx-background-color: " + tint(color) + "; -fx-background-radius: 999; -fx-padding: 6 14;";
    }

    private String tint(String color) {
        return switch (color) {
            case GOOD -> "#e6f4ea";
            case BAD -> "#fce8e6";
            default -> "#fef7e0";
        };
    }

    // ---- networking / lifecycle ----

    /** Begin accepting the browser handshake. */
    private void startListener() {
        listener = new LocalListener();
        try {
            listener.start(agentPort, new LocalListener.Handler() {
                @Override public LocalListener.Result onHandshake(LocalListener.Handshake h) {
                    return handleHandshake(h);
                }
                @Override public boolean isConnected() {
                    return connected && client != null && client.isConnected();
                }
            });
            log(Sev.SYS, "Listening on 127.0.0.1:" + agentPort + " \u2014 open your interview and click \u201CConnect with proctor agent\u201D.");
        } catch (IOException e) {
            setStatus("Couldn't start \u2014 is another Safe Agent already open?", State.BAD);
            log(Sev.BAD, "Failed to listen on port " + agentPort + ": " + e.getMessage());
        }
    }

    /** Called off the FX thread by the local listener when the browser hands off. */
    private LocalListener.Result handleHandshake(LocalListener.Handshake h) {
        lastHandshake = h;
        Platform.runLater(() -> {
            setStatus("Connecting your interview\u2026", State.PENDING);
            showReconnect(false);
            log(Sev.INFO, "Browser handshake received.");
        });
        try {
            AgentClient c = new AgentClient(restBase, grpcHost, grpcPort);
            wireCallbacks(c);
            AgentClient.StartResult r = c.start(h.accessToken(), h.meetingId());
            if (r.ok()) {
                if (client != null) client.stop();
                client = c;
                connected = true;
                Platform.runLater(() -> {
                    String who = r.displayName() == null ? "you" : r.displayName();
                    setStatus("Protected \u2014 connected as " + who, State.GOOD);
                    showReconnect(false);
                    log(Sev.GOOD, "Your interview is connected. Monitoring is active.");
                });
                return new LocalListener.Result(true, r.agentId(), r.displayName(), null);
            }
            c.stop();
            Platform.runLater(() -> { setStatus("Could not connect: " + r.message(), State.BAD); showReconnect(true); });
            return new LocalListener.Result(false, null, null, r.message());
        } catch (Exception e) {
            Platform.runLater(() -> { setStatus("Could not connect: " + e.getMessage(), State.BAD); showReconnect(true); });
            return new LocalListener.Result(false, null, null, e.getMessage());
        }
    }

    /** Rejoin the last meeting after a disconnect (Reconnect button). */
    private void reconnect() {
        if (lastHandshake == null) return;
        reconnectBtn.setDisable(true);
        reconnectBtn.setText("Reconnecting\u2026");
        new Thread(() -> {
            handleHandshake(lastHandshake);
            Platform.runLater(() -> {
                reconnectBtn.setDisable(false);
                reconnectBtn.setText("Reconnect to interview");
            });
        }, "agent-reconnect").start();
    }

    private void wireCallbacks(AgentClient c) {
        c.onStatus(s -> Platform.runLater(() -> {
            String low = s.toLowerCase();
            Sev sev = Sev.SYS;
            if (low.contains("stream closed") || low.contains("stream error") || low.contains("disconnect")
                || low.contains("could not") || low.contains("failed")) {
                connected = false;
                setStatus("Disconnected \u2014 reconnect to keep monitoring", State.BAD);
                showReconnect(true);
                sev = Sev.BAD;
            } else if (low.contains("connected") || low.contains("active") || low.contains("protected")) {
                sev = Sev.GOOD;
            } else if (low.contains("connecting") || low.contains("requested") || low.contains("handshake")) {
                sev = Sev.INFO;
            }
            log(sev, s);
        }));
        c.onFinding(f -> Platform.runLater(() -> {
            switch (f.kind()) {
                case "ENV_SCAN_CLEAN" -> {
                    scanResult.setText("Environment scan: \u2705 No cheat detected");
                    scanResult.setStyle("-fx-text-fill: " + GOOD + "; -fx-font-size: 12px; -fx-font-weight: 700;");
                    log(Sev.GOOD, f.message());
                }
                case "ENV_SCAN_DETECTED", "HIDDEN_OVERLAY_WINDOW", "BLOCKLISTED_PROCESS", "VIRTUAL_CAMERA",
                     "CHEAT_TOOL", "CLICKTHROUGH_OVERLAY", "STEALTH_OVERLAY" -> {
                    scanResult.setText("Environment scan: \u26A0 Cheat detected");
                    scanResult.setStyle("-fx-text-fill: " + BAD + "; -fx-font-size: 12px; -fx-font-weight: 700;");
                    signalCount++; updateStats();
                    log(Sev.BAD, "[" + f.severity() + "] " + f.kind() + " \u2014 " + f.message());
                }
                default -> {
                    Sev sev = "CRITICAL".equals(f.severity()) ? Sev.BAD : "WARN".equals(f.severity()) ? Sev.WARN : Sev.INFO;
                    if (sev != Sev.INFO) { signalCount++; updateStats(); }
                    log(sev, "[" + f.severity() + "] " + f.kind() + " \u2014 " + f.message());
                }
            }
        }));
        c.onCommand(cmd -> Platform.runLater(() ->
            log(Sev.INFO, "Interviewer: " + cmd.getKind() + (cmd.getText().isEmpty() ? "" : " (" + cmd.getText() + ")"))));
    }

    private enum State { GOOD, PENDING, BAD }

    private void setStatus(String text, State s) {
        status.setText(text);
        switch (s) {
            case GOOD -> { paintDot(GOOD); connPill.setText("\u25CF  Protected"); connPill.setStyle(pillStyle(GOOD)); }
            case PENDING -> { paintDot(WARN); connPill.setText("\u25CF  Connecting"); connPill.setStyle(pillStyle(WARN)); }
            case BAD -> { paintDot(BAD); connPill.setText("\u25CF  Disconnected"); connPill.setStyle(pillStyle(BAD)); }
        }
    }

    private void paintDot(String color) {
        statusDot.setStyle("-fx-background-color: " + color + "; -fx-background-radius: 9;");
    }

    private void showReconnect(boolean show) {
        reconnectBtn.setVisible(show && lastHandshake != null);
        reconnectBtn.setManaged(show && lastHandshake != null);
    }

    private void updateStats() {
        statsLabel.setText("Signals: " + signalCount);
    }

    private void updateLineCount() {
        lineCount.setText(logItems.size() + (logItems.size() == 1 ? " line" : " lines"));
    }

    /** Append a colored line to the console (newest at the bottom, auto-scroll). */
    private void log(Sev sev, String text) {
        logItems.add(new LogEntry(LocalTime.now().format(T), sev, text));
        if (logItems.size() > 300) logItems.remove(0, logItems.size() - 300);
        updateLineCount();
        console.scrollTo(logItems.size() - 1);
    }

    private void shutdown() {
        if (client != null) client.stop();
        if (listener != null) listener.stop();
    }

    /**
     * Give Windows an explicit AppUserModelID so the taskbar treats the agent as
     * its own app and uses OUR window icon for the taskbar button — instead of
     * grouping it under the generic java/host-process icon (which is why the
     * logo showed in the title bar but not the taskbar). No-op off Windows.
     */
    private static void setAppUserModelId() {
        try {
            Shell32Ext.INSTANCE.SetCurrentProcessExplicitAppUserModelID(new WString("com.zoomy.SafeAgent"));
        } catch (Throwable ignored) {
            // Non-Windows or shell32 unavailable — the title-bar icon still works.
        }
    }

    /** Minimal shell32 binding for the taskbar grouping id. */
    interface Shell32Ext extends com.sun.jna.win32.StdCallLibrary {
        Shell32Ext INSTANCE = Native.load("shell32", Shell32Ext.class, W32APIOptions.DEFAULT_OPTIONS);
        int SetCurrentProcessExplicitAppUserModelID(WString appId);
    }

    public static void main(String[] args) {
        setAppUserModelId();
        launch(args);
    }
}
