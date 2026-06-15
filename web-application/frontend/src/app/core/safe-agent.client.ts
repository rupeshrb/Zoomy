import { Injectable } from '@angular/core';

/** Status of the locally-running Safe Agent (if any). */
export interface AgentStatus {
  running: boolean;
  connected: boolean;
  version?: string;
}

/** Result of handing the session off to the local agent. */
export interface AgentHandshakeResult {
  ok: boolean;
  agentId?: string;
  displayName?: string;
  error?: string;
}

/**
 * Talks to the desktop Safe Agent's loopback listener (127.0.0.1:7070).
 *
 * The agent has no login — the already-authenticated browser hands off the
 * session here, and the agent connects to the backend on the candidate's behalf.
 * If the agent isn't installed/running, calls reject so the UI can offer the
 * download instead.
 */
@Injectable({ providedIn: 'root' })
export class SafeAgentClient {
  /** Loopback port the desktop agent listens on. */
  private readonly base = 'http://127.0.0.1:7070';

  /** Probe whether the agent is installed and running. Null if unreachable. */
  async status(): Promise<AgentStatus | null> {
    try {
      const res = await this.fetchWithTimeout(`${this.base}/status`, { method: 'GET' }, 1500);
      if (!res.ok) return null;
      return (await res.json()) as AgentStatus;
    } catch {
      return null;   // not installed / not running
    }
  }

  /** Hand the interview session to the agent; it then connects to the backend. */
  async handshake(accessToken: string, meetingId: string, name?: string): Promise<AgentHandshakeResult> {
    const res = await this.fetchWithTimeout(`${this.base}/handshake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, meetingId, name: name ?? '' })
    }, 8000);
    return (await res.json()) as AgentHandshakeResult;
  }

  private async fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }
}
