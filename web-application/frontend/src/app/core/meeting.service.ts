import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_CONFIG, DEFAULT_API_CONFIG } from './api.config';

export type MeetingMode = 'NORMAL' | 'INTERVIEW';

export interface Meeting {
  id: string;
  code: string;
  mode: MeetingMode;
  status?: 'ACTIVE' | 'ENDED';
  hostId: string;
  hostName: string;
  title: string;
  passwordEnabled?: boolean;
  createdAt: string;
  lobbyEnabled?: boolean;
}

const RECENT_KEY = 'zoomy.meetings.recent';

@Injectable({ providedIn: 'root' })
export class MeetingService {
  private http = inject(HttpClient);
  private cfg = inject(API_CONFIG, { optional: true }) ?? DEFAULT_API_CONFIG;

  /** Locally remembered meetings for quick share-link rebuild (no PII). */
  readonly recent = signal<Meeting[]>(this.loadRecent());

  async create(input: { mode: MeetingMode; title?: string }): Promise<Meeting> {
    const m = await firstValueFrom(
      this.http.post<Meeting>(`${this.cfg.baseUrl}/api/meetings`, {
        mode: input.mode,
        title: input.title ?? null
      })
    );
    this.remember(m);
    return m;
  }

  async updatePasswordSettings(meetingId: string, input: { enabled: boolean; password?: string }): Promise<Meeting> {
    return await firstValueFrom(
      this.http.post<Meeting>(`${this.cfg.baseUrl}/api/meetings/${encodeURIComponent(meetingId)}/password`, {
        enabled: input.enabled,
        password: input.password ?? null
      })
    );
  }

  async verifyLobbyAccess(meetingId: string, password?: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.cfg.baseUrl}/api/meetings/${encodeURIComponent(meetingId)}/access`, {
        password: password ?? null
      })
    );
  }

  /**
   * Whether this user's desktop Safe Agent is connected for the meeting
   * (companion-agent anti-cheat over gRPC). Used to release the interview gate.
   */
  async safeAgentConnected(meetingId: string): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ connected: boolean }>(
          `${this.cfg.baseUrl}/api/meetings/${encodeURIComponent(meetingId)}/safe-agent`)
      );
      return !!res?.connected;
    } catch {
      return false;
    }
  }

  /** Fetch meeting by id. Returns null if not found / not authorized. */
  async info(id: string): Promise<Meeting | null> {
    if (!id) return null;
    try {
      return await firstValueFrom(
        this.http.get<Meeting>(`${this.cfg.baseUrl}/api/meetings/${encodeURIComponent(id)}`)
      );
    } catch {
      return null;
    }
  }

  /** Resolve a freeform "code" or share link via public /resolve endpoint. */
  async resolveLink(input: string): Promise<Meeting | null> {
    const key = this.extractCode(input);
    if (!key) return null;
    try {
      return await firstValueFrom(
        this.http.get<Meeting>(`${this.cfg.baseUrl}/api/meetings/resolve`, { params: { code: key } })
      );
    } catch {
      return null;
    }
  }

  buildShareLink(m: Meeting): string {
    return `${location.origin}/j/${m.code}`;
  }

  buildJoinUrl(m: Meeting): string {
    return `${location.origin}/meeting/${m.id}/lobby`;
  }

  // ---- helpers ----

  private extractCode(input: string): string | null {
    const t = (input || '').trim();
    if (!t) return null;
    try {
      const u = new URL(t);
      const tail = u.pathname.split('/').filter(Boolean).pop() || '';
      return tail || null;
    } catch {
      return t;
    }
  }

  private remember(m: Meeting) {
    const list = [m, ...this.recent().filter(x => x.id !== m.id)].slice(0, 10);
    this.recent.set(list);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch {}
  }

  private loadRecent(): Meeting[] {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  }
}
