/**
 * Whether this candidate is cleared to take a proctored interview in this
 * browser. With the companion-agent model the meeting always runs in the normal
 * browser and clearance comes SOLELY from the desktop Safe Agent connecting
 * (verified server-side via MeetingService.safeAgentConnected). There is no
 * special "safe browser", so this is always false on the web — interview
 * candidates must pass the proctor-agent gate before entering.
 */
export function isSafeBrowser(): boolean {
  return false;
}

// One-time cleanup: an earlier build shipped a "Continue anyway (testing only)"
// button that persisted a localStorage bypass (`zoomy.dev.bypassSafeBrowser`).
// That flag would otherwise silently skip the interview gate forever. It is no
// longer honored — remove any stale value so the gate always enforces.
try {
  localStorage.removeItem('zoomy.dev.bypassSafeBrowser');
} catch { /* storage unavailable — ignore */ }
