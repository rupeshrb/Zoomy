import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, BehaviorSubject, Subject } from 'rxjs';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { API_CONFIG, DEFAULT_API_CONFIG } from './api.config';
import { AuthService } from './auth.service';

export interface RoomParticipant {
  participantId: string;
  userId: string;
  name: string;
  role: string;          // 'HOST' | 'GUEST'
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  joinedAt?: string;
  lastSeenAt?: string;
}

export interface RoomChatMsg {
  id: string;
  meetingId: string;
  fromParticipantId: string;
  fromName: string;
  text: string;
  at: string;
}

/** A proctoring signal relayed from a participant's device to the room. */
export interface RoomProctorEvent {
  fromParticipantId: string;
  fromName: string;
  source: string;
  kind: string;
  severity: string;
  message: string;
  at: string;
}

/** Continuous gaze telemetry relayed from a candidate to the interviewer. */
export interface RoomGazeEvent {
  fromParticipantId: string;
  x: number;
  y: number;
  label: string;
  vlabel: string;
  at: string;
}

/** Host control command broadcast to participants. */
export interface RoomControlEvent {
  from: string;
  target: string;        // a participantId, or 'ALL'
  kind: 'mute' | 'cam-off' | 'chat-lock' | 'fullscreen' | 'ai-allow' | 'room-settings' | 'remove' | 'end' | 'rescan';
  value: boolean;
  json?: string;
}

interface RoomSnapshot {
  meetingId: string;
  generatedAt: string;
  participants: RoomParticipant[];
  recentMessages: RoomChatMsg[];
}

interface RoomEvent {
  type: 'PARTICIPANT_JOINED' | 'PARTICIPANT_LEFT' | 'MEDIA_UPDATED' | 'CHAT_MESSAGE';
  meetingId: string;
  at: string;
  participant?: RoomParticipant;
  chat?: RoomChatMsg;
  participantsCount?: number;
  note?: string;
}

/** WebRTC signaling envelope relayed via /topic/room/{id}/signal. */
interface SignalMsg {
  from: string;
  to: string;
  type: 'offer' | 'answer' | 'candidate' | 'screen';
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit | { screenStreamId: string };
}

/** Per-remote-peer connection context for the mesh (perfect negotiation). */
interface PeerCtx {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  remoteStream: MediaStream;       // camera + mic
  remoteScreen: MediaStream;       // shared screen (separate tile)
  /** The msid of the remote's screen track, learned via a 'screen' signal. */
  peerScreenStreamId?: string;
  /** Every inbound track with the stream id it arrived under, for re-tagging. */
  recvTracks: { track: MediaStreamTrack; streamId: string }[];
  senders: Map<'audio' | 'video' | 'screen', RTCRtpSender>;
}

export interface JoinInfo {
  userId: string;
  name: string;
  role: 'host' | 'guest';
  micOn: boolean;
  camOn: boolean;
}

/**
 * Real-time room presence + chat over STOMP/SockJS.
 * Mirrors the backend RoomController channels:
 *   send  /app/room/{id}/join|media|chat|leave
 *   recv  /topic/room/{id}/events  and  /topic/room/{id}/snapshot
 */
@Injectable({ providedIn: 'root' })
export class RoomService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private cfg = inject(API_CONFIG, { optional: true }) ?? DEFAULT_API_CONFIG;

  /** Stable id for THIS browser/tab within the room. */
  readonly participantId = crypto.randomUUID();

  readonly participants$ = new BehaviorSubject<RoomParticipant[]>([]);
  readonly joined$ = new Subject<RoomParticipant>();
  readonly left$ = new Subject<RoomParticipant>();
  readonly media$ = new Subject<RoomParticipant>();
  readonly chat$ = new Subject<RoomChatMsg>();
  readonly connected$ = new BehaviorSubject<boolean>(false);

  /** Emits proctoring signals raised by any participant in the room. */
  readonly proctor$ = new Subject<RoomProctorEvent>();

  /** Emits continuous gaze telemetry from candidates (interviewer readout). */
  readonly gaze$ = new Subject<RoomGazeEvent>();

  /** Emits host control commands (mute/cam/chat-lock/ai/settings/end). */
  readonly control$ = new Subject<RoomControlEvent>();

  /** Emits whenever a remote participant's media stream gains/changes tracks. */
  readonly remoteStream$ = new Subject<{ participantId: string; stream: MediaStream }>();

  /** Emits a remote participant's shared-screen stream (separate tile). */
  readonly remoteScreen$ = new Subject<{ participantId: string; stream: MediaStream | null }>();

  private stomp?: Client;
  private meetingId = '';
  private info?: JoinInfo;
  private left = false;

  // ---- WebRTC mesh ----
  private localStream?: MediaStream;
  /** Dedicated broadcast stream that carries the local shared-screen track. */
  private screenStream?: MediaStream;
  private peers = new Map<string, PeerCtx>();
  private readonly iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' }
  ];

  async connect(meetingId: string, info: JoinInfo): Promise<void> {
    this.meetingId = meetingId;
    this.info = info;
    this.left = false;

    // Seed from REST snapshot so we render existing participants immediately.
    try {
      const snap = await firstValueFrom(
        this.http.get<RoomSnapshot>(`${this.cfg.baseUrl}/api/meetings/${encodeURIComponent(meetingId)}/room/snapshot`)
      );
      this.participants$.next(snap?.participants ?? []);
    } catch { /* snapshot best-effort; events will reconcile */ }

    await this.connectStomp();
    this.sendJoin();
  }

  private connectStomp(): Promise<void> {
    return new Promise<void>(resolve => {
      const client = new Client({
        webSocketFactory: () => new SockJS(`${this.cfg.baseUrl}/ws`),
        reconnectDelay: 2000,
        onConnect: () => {
          client.subscribe(`/topic/room/${this.meetingId}/events`,
            (m: IMessage) => this.onEvent(JSON.parse(m.body)));
          client.subscribe(`/topic/room/${this.meetingId}/snapshot`,
            (m: IMessage) => this.onSnapshot(JSON.parse(m.body)));
          client.subscribe(`/topic/room/${this.meetingId}/signal`,
            (m: IMessage) => this.onSignal(JSON.parse(m.body)));
          client.subscribe(`/topic/room/${this.meetingId}/proctor`,
            (m: IMessage) => this.proctor$.next(JSON.parse(m.body)));
          client.subscribe(`/topic/room/${this.meetingId}/gaze`,
            (m: IMessage) => this.gaze$.next(JSON.parse(m.body)));
          client.subscribe(`/topic/room/${this.meetingId}/control`,
            (m: IMessage) => this.control$.next(JSON.parse(m.body)));
          this.connected$.next(true);
          // Re-announce presence after a reconnect.
          if (this.left === false) this.sendJoin();
          resolve();
        },
        onWebSocketClose: () => this.connected$.next(false)
      });
      this.stomp = client;
      client.activate();
    });
  }

  private sendJoin() {
    if (!this.stomp?.connected || !this.info) return;
    this.publish(`/app/room/${this.meetingId}/join`, {
      participantId: this.participantId,
      userId: this.info.userId,
      name: this.info.name,
      role: this.info.role === 'host' ? 'HOST' : 'GUEST',
      micOn: this.info.micOn,
      camOn: this.info.camOn,
      screenOn: false
    });
  }

  sendMedia(micOn: boolean, camOn: boolean, screenOn: boolean) {
    this.publish(`/app/room/${this.meetingId}/media`, {
      participantId: this.participantId, micOn, camOn, screenOn
    });
  }

  sendChat(text: string) {
    const t = (text || '').trim();
    if (!t) return;
    this.publish(`/app/room/${this.meetingId}/chat`, {
      fromParticipantId: this.participantId, text: t
    });
  }

  /** Report a proctoring signal (gaze/no-face/etc.) raised on this device. */
  sendProctor(ev: { fromName: string; source: string; kind: string; severity: string; message: string }): boolean {
    if (!this.stomp?.connected) return false;
    this.publish(`/app/room/${this.meetingId}/proctor`, {
      fromParticipantId: this.participantId,
      fromName: ev.fromName,
      source: ev.source,
      kind: ev.kind,
      severity: ev.severity,
      message: ev.message,
      at: new Date().toISOString()
    });
    return true;
  }

  /** Report continuous gaze telemetry (throttled by the caller). */
  sendGaze(x: number, y: number, label: string, vlabel: string) {
    if (!this.stomp?.connected) return;
    this.publish(`/app/room/${this.meetingId}/gaze`, {
      fromParticipantId: this.participantId,
      x, y, label, vlabel,
      at: new Date().toISOString()
    });
  }

  /** Host: broadcast a control command to a participant (or 'ALL'). */
  sendControl(kind: RoomControlEvent['kind'], target: string, value: boolean, json?: string) {
    if (!this.stomp?.connected) return;
    this.publish(`/app/room/${this.meetingId}/control`, {
      from: this.participantId, target, kind, value, json: json ?? null
    });
  }

  leave() {
    this.left = true;
    try {
      this.publish(`/app/room/${this.meetingId}/leave`, { participantId: this.participantId });
    } catch { /* ignore */ }
    this.teardownPeers();
    this.localStream = undefined;
    this.screenStream = undefined;
    this.connected$.next(false);
    void this.stomp?.deactivate();
    this.stomp = undefined;
  }

  // ---- WebRTC mesh (peer-to-peer media) ----

  /**
   * Publish the local camera/mic stream to every peer. Call this whenever the
   * local stream changes (camera/mic turned on or off). Tracks are swapped onto
   * existing peer connections without a full renegotiation where possible.
   */
  setLocalStream(stream?: MediaStream) {
    this.localStream = stream;
    for (const ctx of this.peers.values()) this.syncSenders(ctx);
  }

  /**
   * Publish (or clear) the local shared-screen as a SEPARATE outbound stream,
   * so remotes render it as its own tile alongside the camera. The screen track
   * is wrapped in a dedicated MediaStream whose id is announced to each peer so
   * they can tell screen frames apart from camera frames.
   */
  setScreenStream(stream?: MediaStream) {
    const track = stream?.getVideoTracks()[0];
    if (track) {
      // Wrap in our own stream so the msid is stable and announceable.
      this.screenStream = new MediaStream([track]);
    } else {
      this.screenStream = undefined;
    }
    for (const ctx of this.peers.values()) {
      this.syncScreenSender(ctx);
      this.announceScreen(ctx);
    }
  }

  /** The current inbound camera stream for a remote participant, if any. */
  remoteStreamFor(participantId: string): MediaStream | null {
    return this.peers.get(participantId)?.remoteStream ?? null;
  }

  /** The current inbound shared-screen stream for a remote participant, if any. */
  remoteScreenFor(participantId: string): MediaStream | null {
    const s = this.peers.get(participantId)?.remoteScreen;
    return s && s.getTracks().length ? s : null;
  }

  /** Ensure a peer connection exists for every other participant; drop departed ones. */
  private reconcilePeers() {
    const ids = new Set(this.participants$.value.map(p => p.participantId));
    for (const id of [...this.peers.keys()]) {
      if (!ids.has(id)) this.closePeer(id);
    }
    for (const id of ids) {
      if (id !== this.participantId) this.ensurePeer(id);
    }
  }

  private ensurePeer(remoteId: string): PeerCtx {
    const existing = this.peers.get(remoteId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const ctx: PeerCtx = {
      pc,
      // Deterministic, symmetric roles avoid offer glare: exactly one side is polite.
      polite: this.participantId > remoteId,
      makingOffer: false,
      ignoreOffer: false,
      remoteStream: new MediaStream(),
      remoteScreen: new MediaStream(),
      recvTracks: [],
      senders: new Map()
    };
    this.peers.set(remoteId, ctx);

    pc.onnegotiationneeded = async () => {
      try {
        ctx.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) this.sendSignal(remoteId, pc.localDescription.type as 'offer' | 'answer', pc.localDescription.toJSON());
      } catch { /* transient; will retry on next negotiation */ }
      finally { ctx.makingOffer = false; }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.sendSignal(remoteId, 'candidate', candidate.toJSON());
    };

    pc.ontrack = (ev) => {
      const track = ev.track;
      const streamId = ev.streams[0]?.id ?? '';
      ctx.recvTracks.push({ track, streamId });
      track.onended = () => {
        ctx.recvTracks = ctx.recvTracks.filter(r => r.track !== track);
        try { ctx.remoteStream.removeTrack(track); } catch { /* */ }
        try { ctx.remoteScreen.removeTrack(track); } catch { /* */ }
        this.retagRemote(ctx, remoteId);
      };
      this.retagRemote(ctx, remoteId);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        try { pc.restartIce(); } catch { /* ignore */ }
      }
    };

    // Attach whatever local media we already have (may trigger an initial offer).
    this.syncSenders(ctx);
    this.syncScreenSender(ctx);
    this.announceScreen(ctx);
    return ctx;
  }

  /** Add/replace/clear local audio+video tracks on a peer to match localStream. */
  private syncSenders(ctx: PeerCtx) {
    (['audio', 'video'] as const).forEach(kind => {
      const track = kind === 'audio'
        ? this.localStream?.getAudioTracks()[0] ?? null
        : this.localStream?.getVideoTracks()[0] ?? null;
      const sender = ctx.senders.get(kind);
      if (track) {
        if (sender) {
          void sender.replaceTrack(track);
        } else {
          // addTrack triggers onnegotiationneeded → offer to the remote.
          const s = ctx.pc.addTrack(track, this.localStream!);
          ctx.senders.set(kind, s);
        }
      } else if (sender) {
        // Track turned off: stop sending media but keep the transceiver alive.
        void sender.replaceTrack(null);
      }
    });
  }

  /** Add/replace/clear the local shared-screen track on a peer. */
  private syncScreenSender(ctx: PeerCtx) {
    const track = this.screenStream?.getVideoTracks()[0] ?? null;
    const sender = ctx.senders.get('screen');
    if (track) {
      if (sender) {
        void sender.replaceTrack(track);
      } else {
        const s = ctx.pc.addTrack(track, this.screenStream!);
        ctx.senders.set('screen', s);
      }
    } else if (sender) {
      void sender.replaceTrack(null);
    }
  }

  /** Tell a peer which msid carries our shared screen (or that we stopped). */
  private announceScreen(ctx: PeerCtx) {
    const id = this.screenStream?.id ?? '';
    // Find the remoteId for this ctx to address the signal.
    for (const [remoteId, c] of this.peers) {
      if (c === ctx) { this.sendSignal(remoteId, 'screen', { screenStreamId: id }); break; }
    }
  }

  /** Route inbound tracks into the camera vs. screen stream and notify the UI. */
  private retagRemote(ctx: PeerCtx, remoteId: string) {
    for (const { track, streamId } of ctx.recvTracks) {
      const isScreen = !!ctx.peerScreenStreamId && streamId === ctx.peerScreenStreamId;
      const target = isScreen ? ctx.remoteScreen : ctx.remoteStream;
      const other = isScreen ? ctx.remoteStream : ctx.remoteScreen;
      if (!target.getTracks().includes(track)) target.addTrack(track);
      if (other.getTracks().includes(track)) other.removeTrack(track);
    }
    this.remoteStream$.next({ participantId: remoteId, stream: ctx.remoteStream });
    this.remoteScreen$.next({
      participantId: remoteId,
      stream: ctx.remoteScreen.getTracks().length ? ctx.remoteScreen : null
    });
  }

  private async onSignal(msg: SignalMsg) {
    if (!msg || msg.to !== this.participantId || msg.from === this.participantId) return;
    const ctx = this.ensurePeer(msg.from);
    const pc = ctx.pc;
    try {
      if (msg.type === 'offer' || msg.type === 'answer') {
        const description = msg.payload as RTCSessionDescriptionInit;
        const collision = description.type === 'offer' &&
          (ctx.makingOffer || pc.signalingState !== 'stable');
        ctx.ignoreOffer = !ctx.polite && collision;
        if (ctx.ignoreOffer) return;

        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          if (pc.localDescription) this.sendSignal(msg.from, 'answer', pc.localDescription.toJSON());
        }
      } else if (msg.type === 'candidate') {
        try {
          await pc.addIceCandidate(msg.payload as RTCIceCandidateInit);
        } catch (e) {
          if (!ctx.ignoreOffer) throw e;
        }
      } else if (msg.type === 'screen') {
        // The remote told us which msid carries their shared screen.
        const id = (msg.payload as { screenStreamId: string })?.screenStreamId || '';
        ctx.peerScreenStreamId = id || undefined;
        this.retagRemote(ctx, msg.from);
      }
    } catch { /* swallow signaling races; perfect negotiation recovers */ }
  }

  private sendSignal(
    to: string,
    type: 'offer' | 'answer' | 'candidate' | 'screen',
    payload: RTCSessionDescriptionInit | RTCIceCandidateInit | { screenStreamId: string }
  ) {
    if (!this.stomp?.connected) return;
    this.publish(`/app/room/${this.meetingId}/signal`, {
      from: this.participantId,
      to,
      type,
      payload
    });
  }

  private closePeer(remoteId: string) {
    const ctx = this.peers.get(remoteId);
    if (!ctx) return;
    try { ctx.pc.close(); } catch { /* ignore */ }
    this.peers.delete(remoteId);
  }

  private teardownPeers() {
    for (const id of [...this.peers.keys()]) this.closePeer(id);
  }

  // ---- inbound ----

  private onSnapshot(snap: RoomSnapshot) {
    if (!snap) return;
    this.participants$.next(snap.participants ?? []);
    this.reconcilePeers();
  }

  private onEvent(ev: RoomEvent) {
    if (!ev) return;
    switch (ev.type) {
      case 'PARTICIPANT_JOINED':
        if (ev.participant) {
          this.upsert(ev.participant);
          if (ev.participant.participantId !== this.participantId) this.joined$.next(ev.participant);
        }
        break;
      case 'PARTICIPANT_LEFT':
        if (ev.participant) {
          this.remove(ev.participant.participantId);
          if (ev.participant.participantId !== this.participantId) this.left$.next(ev.participant);
        }
        break;
      case 'MEDIA_UPDATED':
        if (ev.participant) { this.upsert(ev.participant); this.media$.next(ev.participant); }
        break;
      case 'CHAT_MESSAGE':
        if (ev.chat) this.chat$.next(ev.chat);
        break;
    }
  }

  private upsert(p: RoomParticipant) {
    const list = this.participants$.value.slice();
    const i = list.findIndex(x => x.participantId === p.participantId);
    if (i >= 0) list[i] = p; else list.push(p);
    this.participants$.next(list);
    this.reconcilePeers();
  }

  private remove(participantId: string) {
    this.participants$.next(this.participants$.value.filter(x => x.participantId !== participantId));
    this.closePeer(participantId);
  }

  private publish(destination: string, body: unknown) {
    this.stomp?.publish({ destination, body: JSON.stringify(body) });
  }
}
