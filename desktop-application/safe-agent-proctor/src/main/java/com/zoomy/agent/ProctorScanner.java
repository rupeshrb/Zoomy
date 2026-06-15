package com.zoomy.agent;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import com.sun.jna.Native;
import com.sun.jna.Pointer;
import com.sun.jna.platform.win32.Kernel32;
import com.sun.jna.platform.win32.Psapi;
import com.sun.jna.platform.win32.User32;
import com.sun.jna.platform.win32.WinDef.DWORDByReference;
import com.sun.jna.platform.win32.WinDef.HWND;
import com.sun.jna.platform.win32.WinDef.RECT;
import com.sun.jna.platform.win32.WinNT.HANDLE;
import com.sun.jna.ptr.IntByReference;
import com.sun.jna.win32.W32APIOptions;

import java.awt.GraphicsEnvironment;

/**
 * Advanced native anti-cheat scan for Windows (mirrors and extends the old
 * Electron safe-browser check).
 *
 * <p>Interview-cheating overlays — Cluely, Interview Coder, LockedIn AI,
 * Parakeet AI, Cheetah, LeetCode Wizard, Final Round AI … — stay invisible to a
 * browser-based screen share with a small bag of Win32 tricks:
 * <ul>
 *   <li>{@code SetWindowDisplayAffinity(hWnd, WDA_EXCLUDEFROMCAPTURE)} — the
 *       window draws on the candidate's monitor but is punched out of every
 *       screen capture / share. This is the killer move and it is undetectable
 *       from inside the browser.</li>
 *   <li>{@code WS_EX_TOOLWINDOW} (and {@code ITaskbarList::DeleteTab}) — removes
 *       the app's button from the taskbar and from Alt-Tab so nothing gives it
 *       away.</li>
 *   <li>{@code WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST} — a
 *       click-through always-on-top overlay floating above the meeting.</li>
 * </ul>
 *
 * <p>A native process can read all of this back ({@code GetWindowDisplayAffinity},
 * {@code GetWindowLong}) on every top-level window. When we find one we try to
 * <em>surface</em> it cross-process: restore its taskbar / Alt-Tab button, drop
 * topmost, strip click-through, and attempt to clear the capture exclusion. The
 * affinity clear only succeeds for windows owned by this process (Win32 forbids
 * cross-process changes — see the SetWindowDisplayAffinity docs), but the
 * detection itself is rock solid and is reported up to the interviewer as proof.
 *
 * <p>Degrades to an empty result on non-Windows hosts.
 */
public final class ProctorScanner {

    /** One finding to report up the gRPC channel. */
    public record Finding(String kind, String severity, String message) {}

    // Display-affinity values (winuser.h)
    private static final int WDA_NONE = 0x0;
    private static final int WDA_MONITOR = 0x1;
    private static final int WDA_EXCLUDEFROMCAPTURE = 0x11;

    // Window styles (winuser.h)
    private static final int GWL_EXSTYLE = -20;
    private static final int WS_EX_TOPMOST = 0x00000008;
    private static final int WS_EX_TRANSPARENT = 0x00000020;
    private static final int WS_EX_TOOLWINDOW = 0x00000080;
    private static final int WS_EX_APPWINDOW = 0x00040000;
    private static final int WS_EX_LAYERED = 0x00080000;
    private static final int WS_EX_NOACTIVATE = 0x08000000;

    // ShowWindow / SetWindowPos
    private static final int SW_HIDE = 0;
    private static final int SW_SHOW = 5;
    private static final int SWP_NOSIZE = 0x0001;
    private static final int SWP_NOMOVE = 0x0002;
    private static final int SWP_NOACTIVATE = 0x0010;
    private static final int SWP_FRAMECHANGED = 0x0020;
    private static final int SWP_SHOWWINDOW = 0x0040;
    private static final int LWA_ALPHA = 0x2;
    private static final HWND HWND_NOTOPMOST = new HWND(Pointer.createConstant(-2));

    /** Known cheat-tool executables (lower-case basenames). */
    private static final Set<String> BLOCKLIST = Set.of(
        "cluely.exe",
        "interview-coder.exe", "interviewcoder.exe", "interview_coder.exe",
        "lockedin.exe", "lockedinai.exe", "lockedin-ai.exe", "lockedinai-desktop.exe",
        "parakeet.exe", "parakeet-ai.exe", "parakeetai.exe",
        "cheetah.exe", "cheetah-ai.exe",
        "leetcode-wizard.exe", "leetcodewizard.exe",
        "finalround.exe", "final-round.exe", "finalroundai.exe",
        "wiseflow.exe", "ultracode.exe", "interviewbuddy.exe", "aceinterview.exe",
        "sensei.exe", "glasp.exe", "screenpipe.exe");

    /** Brand keywords matched against window titles / exe names. */
    private static final List<String> KEYWORDS = List.of(
        "cluely", "interview coder", "interviewcoder", "lockedin", "locked in",
        "parakeet", "cheetah ai", "leetcode wizard", "final round", "finalround",
        "wiseflow", "ultracode", "interviewbuddy", "ace interview", "interview assistant",
        "interview copilot", "interview helper");

    /** Shell / system owners we never flag (avoids desktop & input noise). */
    private static final Set<String> SKIP_EXE = Set.of(
        "<unknown>", "", "explorer.exe", "dwm.exe", "sihost.exe",
        "searchhost.exe", "shellexperiencehost.exe", "startmenuexperiencehost.exe",
        "textinputhost.exe", "searchapp.exe", "lockapp.exe");

    private final boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    private final int myPid = (int) ProcessHandle.current().pid();

    /** Signatures reported on the previous cycle (for incremental de-dup). */
    private final Set<String> seen = ConcurrentHashMap.newKeySet();
    /** HWNDs we've already done the disruptive (hide/show) reveal on. */
    private final Set<Long> revealedOnce = ConcurrentHashMap.newKeySet();

    /**
     * Periodic scan: detect + surface hidden windows, but only RETURN findings
     * that are new since the last cycle (keeps the activity console from
     * repeating the same line every few seconds).
     */
    public List<Finding> scanWindows() {
        return scan(false);
    }

    /**
     * On-demand scan (interviewer pressed "Scan now", or the baseline scan at
     * interview start): detect + surface AND return every current detection so
     * the clean/detected summary is accurate.
     */
    public List<Finding> scanNow() {
        return scan(true);
    }

    private List<Finding> scan(boolean fullReport) {
        List<Finding> out = new ArrayList<>();
        if (!windows) return out;
        Set<String> current = new HashSet<>();

        User32 user32 = User32.INSTANCE;
        user32.EnumWindows((hWnd, data) -> {
            try {
                if (!user32.IsWindowVisible(hWnd)) return true;

                int pid = pidOf(user32, hWnd);
                if (pid == myPid) return true;                 // never flag ourselves

                String exe = processExe(pid);
                String base = baseName(exe).toLowerCase(Locale.ROOT);
                if (SKIP_EXE.contains(base)) return true;

                String title = windowTitle(user32, hWnd);
                int ex = WinExt.INSTANCE.GetWindowLongW(hWnd, GWL_EXSTYLE);
                int aff = affinityOf(hWnd);

                boolean captureExcluded = aff == WDA_EXCLUDEFROMCAPTURE || aff == WDA_MONITOR;
                boolean layered = (ex & WS_EX_LAYERED) != 0;
                boolean transparent = (ex & WS_EX_TRANSPARENT) != 0;
                boolean toolwindow = (ex & WS_EX_TOOLWINDOW) != 0;
                boolean topmost = (ex & WS_EX_TOPMOST) != 0;
                boolean cheatTool = isCheatTool(base, title);
                boolean sizable = hasRealSize(user32, hWnd);

                // Classify (most-severe first). Heuristic overlays require a real
                // size so we don't trip over tiny tooltips / system surfaces.
                String kind = null, severity = "CRITICAL";
                if (cheatTool) {
                    kind = "CHEAT_TOOL";
                } else if (captureExcluded) {
                    kind = "HIDDEN_OVERLAY_WINDOW";
                } else if (layered && transparent && topmost && sizable) {
                    kind = "CLICKTHROUGH_OVERLAY";
                    severity = "WARN";
                } else if (toolwindow && topmost && layered && sizable) {
                    kind = "STEALTH_OVERLAY";
                    severity = "WARN";
                }
                if (kind == null) return true;

                Reveal reveal = revealWindow(user32, hWnd, ex, layered, captureExcluded);

                String sig = kind + "|" + base + "|" + title;
                current.add(sig);
                if (fullReport || !seen.contains(sig)) {
                    out.add(new Finding(kind, severity, describe(kind, title, exe, aff, reveal)));
                }
            } catch (Throwable ignored) {
                // Never let one bad window abort the whole enumeration.
            }
            return true;
        }, null);

        // Replace the seen-set with the current snapshot so a window that closes
        // and re-opens is reported again, while persistent ones stay quiet.
        seen.clear();
        seen.addAll(current);
        return out;
    }

    /** Outcome of an attempted reveal, woven into the human-readable message. */
    private record Reveal(boolean captureCleared, boolean taskbarRestored, boolean droppedTopmost) {}

    /**
     * Best-effort surface of a hidden window so the interviewer (and the
     * candidate's own taskbar) can see it. Cross-process style changes and
     * ShowWindow work; the capture-affinity clear only takes effect for windows
     * owned by this process (Win32 restriction), so we attempt it and report
     * truthfully whether it stuck.
     */
    private Reveal revealWindow(User32 user32, HWND hWnd, int ex, boolean layered, boolean captureExcluded) {
        boolean captureCleared = false;
        if (captureExcluded) {
            // Attempt to lift the screen-capture exclusion (succeeds same-process).
            captureCleared = WinExt.INSTANCE.SetWindowDisplayAffinity(hWnd, WDA_NONE)
                && affinityOf(hWnd) == WDA_NONE;
        }

        // Strip the stealth ex-styles and force a taskbar / Alt-Tab button.
        int newEx = ex & ~(WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
        newEx |= WS_EX_APPWINDOW;
        boolean styleChanged = newEx != ex;
        if (styleChanged) WinExt.INSTANCE.SetWindowLongW(hWnd, GWL_EXSTYLE, newEx);

        // If it was a layered (often near-transparent) overlay, force it opaque.
        if (layered) WinExt.INSTANCE.SetLayeredWindowAttributes(hWnd, 0, (byte) 255, LWA_ALPHA);

        long key = Pointer.nativeValue(hWnd.getPointer());
        boolean firstTime = revealedOnce.add(key);
        boolean droppedTopmost = false;
        if (firstTime || styleChanged) {
            // Re-cycle visibility so the shell re-evaluates the taskbar button,
            // then drop always-on-top WITHOUT stealing the candidate's focus.
            user32.ShowWindow(hWnd, SW_HIDE);
            user32.ShowWindow(hWnd, SW_SHOW);
            droppedTopmost = WinExt.INSTANCE.SetWindowPos(hWnd, HWND_NOTOPMOST, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED | SWP_SHOWWINDOW | SWP_NOACTIVATE);
        }
        return new Reveal(captureCleared, styleChanged, droppedTopmost);
    }

    private String describe(String kind, String title, String exe, int aff, Reveal r) {
        String name = (title == null || title.isBlank() || "<no title>".equals(title))
            ? baseName(exe) : title;
        StringBuilder sb = new StringBuilder();
        switch (kind) {
            case "CHEAT_TOOL" -> sb.append("Known interview-cheating tool detected: \"")
                .append(name).append("\" (").append(exe).append(").");
            case "HIDDEN_OVERLAY_WINDOW" -> sb.append("Hidden overlay \"").append(name)
                .append("\" (").append(exe).append(") was excluding itself from screen capture (affinity=0x")
                .append(Integer.toHexString(aff)).append(").");
            case "CLICKTHROUGH_OVERLAY" -> sb.append("Click-through always-on-top overlay \"").append(name)
                .append("\" (").append(exe).append(") floating over the meeting.");
            case "STEALTH_OVERLAY" -> sb.append("Stealth window \"").append(name)
                .append("\" (").append(exe).append(") hidden from the taskbar / Alt-Tab.");
            default -> sb.append("Suspicious window \"").append(name).append("\" (").append(exe).append(").");
        }
        // Append the reveal outcome so the interviewer knows what the agent did.
        if (r.captureCleared()) {
            sb.append(" Forced back into the shared screen");
            if (r.taskbarRestored()) sb.append(" + taskbar");
            sb.append('.');
        } else if (r.taskbarRestored() || r.droppedTopmost()) {
            sb.append(" Surfaced to the taskbar / Alt-Tab and reported as proof")
              .append(" (capture-exclusion is owned by the tool, so the agent flags it natively).");
        } else {
            sb.append(" Flagged and reported as proof.");
        }
        return sb.toString();
    }

    /** Number of attached displays (more than one is a soft proctoring flag). */
    public int monitorCount() {
        try {
            return GraphicsEnvironment.getLocalGraphicsEnvironment().getScreenDevices().length;
        } catch (Throwable t) {
            return 1;
        }
    }

    // ---- helpers ----

    private boolean isCheatTool(String base, String title) {
        if (BLOCKLIST.contains(base)) return true;
        String t = title == null ? "" : title.toLowerCase(Locale.ROOT);
        String b = base.toLowerCase(Locale.ROOT);
        for (String k : KEYWORDS) {
            if (t.contains(k)) return true;
            if (b.contains(k.replace(" ", ""))) return true;
        }
        return false;
    }

    private int affinityOf(HWND hWnd) {
        DWORDByReference ref = new DWORDByReference();
        if (!WinExt.INSTANCE.GetWindowDisplayAffinity(hWnd, ref)) return WDA_NONE;
        return ref.getValue().intValue();
    }

    private boolean hasRealSize(User32 user32, HWND hWnd) {
        RECT r = new RECT();
        if (!user32.GetWindowRect(hWnd, r)) return false;
        return (r.right - r.left) >= 120 && (r.bottom - r.top) >= 60;
    }

    private int pidOf(User32 user32, HWND hWnd) {
        IntByReference pidRef = new IntByReference();
        user32.GetWindowThreadProcessId(hWnd, pidRef);
        return pidRef.getValue();
    }

    private String windowTitle(User32 user32, HWND hWnd) {
        char[] buf = new char[512];
        int len = user32.GetWindowText(hWnd, buf, buf.length);
        return len > 0 ? new String(buf, 0, len) : "<no title>";
    }

    private String processExe(int pid) {
        HANDLE h = Kernel32.INSTANCE.OpenProcess(
            0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid);
        if (h == null) return "<unknown>";
        try {
            char[] path = new char[1024];
            int n = Psapi.INSTANCE.GetModuleFileNameExW(h, null, path, path.length);
            return n > 0 ? new String(path, 0, n) : "<unknown>";
        } finally {
            Kernel32.INSTANCE.CloseHandle(h);
        }
    }

    private static String baseName(String path) {
        int i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
        return i >= 0 ? path.substring(i + 1) : path;
    }

    /**
     * Win32 entry points JNA's bundled User32 doesn't expose. Bound against
     * user32 with the standard W32 options (Unicode, last-error).
     */
    interface WinExt extends com.sun.jna.win32.StdCallLibrary {
        WinExt INSTANCE = Native.load("user32", WinExt.class, W32APIOptions.DEFAULT_OPTIONS);

        boolean GetWindowDisplayAffinity(HWND hWnd, DWORDByReference pdwAffinity);
        boolean SetWindowDisplayAffinity(HWND hWnd, int dwAffinity);
        int GetWindowLongW(HWND hWnd, int nIndex);
        int SetWindowLongW(HWND hWnd, int nIndex, int dwNewLong);
        boolean SetLayeredWindowAttributes(HWND hWnd, int crKey, byte bAlpha, int dwFlags);
        boolean SetWindowPos(HWND hWnd, HWND hWndInsertAfter, int x, int y, int cx, int cy, int uFlags);
    }
}
