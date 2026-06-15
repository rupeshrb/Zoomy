export interface ProctorEvent {
  sessionId: string;
  candidateId: string;
  source: 'BROWSER' | 'SAFE_BROWSER';
  kind:
    | 'GAZE_OFF_SCREEN' | 'MULTIPLE_FACES' | 'NO_FACE'
    | 'TAB_BLUR' | 'WINDOW_BLUR' | 'PASTE_DETECTED' | 'DEVTOOLS_OPEN'
    | 'HIDDEN_OVERLAY_WINDOW' | 'BLOCKLISTED_PROCESS'
    | 'CHEAT_TOOL' | 'CLICKTHROUGH_OVERLAY' | 'STEALTH_OVERLAY'
    | 'MULTIPLE_MONITORS' | 'VIRTUAL_CAMERA' | 'SAFE_BROWSER_TAMPERED'
    | 'ENV_SCAN_CLEAN' | 'ENV_SCAN_DETECTED' | 'AGENT_DISCONNECTED' | 'AGENT_CONNECTED';
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  message: string;
  occurredAt?: string;
}
