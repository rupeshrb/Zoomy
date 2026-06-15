package com.zoomy.api.events;

import java.time.Instant;

/**
 * One proctor signal. Emitted by either the browser (gaze, tab-blur, multi-face)
 * or by the Safe Browser desktop wrapper (overlay, blocklisted process, multi-monitor).
 */
public record ProctorEvent(
        String sessionId,
        String candidateId,
        Source source,
        Kind kind,
        Severity severity,
        String message,
        Instant occurredAt
) {
    public enum Source { BROWSER, SAFE_BROWSER }

    public enum Kind {
        // Browser-side
        GAZE_OFF_SCREEN,
        MULTIPLE_FACES,
        NO_FACE,
        TAB_BLUR,
        WINDOW_BLUR,
        PASTE_DETECTED,
        DEVTOOLS_OPEN,
        // Safe-Browser-side
        HIDDEN_OVERLAY_WINDOW,
        BLOCKLISTED_PROCESS,
        MULTIPLE_MONITORS,
        VIRTUAL_CAMERA,
        SAFE_BROWSER_TAMPERED
    }

    public enum Severity { INFO, WARN, CRITICAL }
}
