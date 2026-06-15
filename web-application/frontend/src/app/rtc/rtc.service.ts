import { Injectable } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { Subject } from 'rxjs';
import { ProctorEvent } from '../proctor/proctor-event.model';

const WS_URL = 'http://localhost:8080/ws';

/**
 * Thin WebRTC signaling + alerts client. One peer connection per remote.
 * Demo-quality: assumes 1 interviewer + 1 candidate per session. Use an SFU for >2.
 */
@Injectable({ providedIn: 'root' })
export class RtcService {
  readonly remoteStream$ = new Subject<MediaStream>();
  readonly alert$ = new Subject<ProctorEvent>();

  private stomp?: Client;
  private pc?: RTCPeerConnection;
  private sessionId = '';
  private selfId = crypto.randomUUID();

  async join(sessionId: string, isInterviewer: boolean, localStream: MediaStream) {
    this.sessionId = sessionId;
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    localStream.getTracks().forEach(t => this.pc!.addTrack(t, localStream));
    this.pc.ontrack = e => this.remoteStream$.next(e.streams[0]);
    this.pc.onicecandidate = e => {
      if (e.candidate) this.send({ from: this.selfId, to: '*', type: 'ice', payload: e.candidate });
    };

    await this.connectStomp();

    if (isInterviewer) {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.send({ from: this.selfId, to: '*', type: 'offer', payload: offer });
    }
  }

  private async connectStomp(): Promise<void> {
    this.stomp = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      reconnectDelay: 2000
    });
    await new Promise<void>(resolve => {
      this.stomp!.onConnect = () => {
        this.stomp!.subscribe(`/topic/signal/${this.sessionId}`,
          (m: IMessage) => this.handleSignal(JSON.parse(m.body)));
        this.stomp!.subscribe(`/topic/session/${this.sessionId}`,
          (m: IMessage) => this.alert$.next(JSON.parse(m.body)));
        resolve();
      };
      this.stomp!.activate();
    });
  }

  private async handleSignal(msg: { from: string; type: string; payload: any }) {
    if (msg.from === this.selfId) return;
    if (msg.type === 'offer') {
      await this.pc!.setRemoteDescription(msg.payload);
      const ans = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(ans);
      this.send({ from: this.selfId, to: msg.from, type: 'answer', payload: ans });
    } else if (msg.type === 'answer') {
      await this.pc!.setRemoteDescription(msg.payload);
    } else if (msg.type === 'ice' && msg.payload) {
      try { await this.pc!.addIceCandidate(msg.payload); } catch {}
    }
  }

  private send(payload: any) {
    this.stomp?.publish({ destination: `/app/signal/${this.sessionId}`, body: JSON.stringify(payload) });
  }
}
