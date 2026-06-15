import { Injectable } from '@angular/core';
import { ProctorEvent } from './proctor-event.model';

const API_BASE = 'http://localhost:8080';

@Injectable({ providedIn: 'root' })
export class ProctorService {
  emit(event: ProctorEvent): void {
    // Fire-and-forget. Use sendBeacon when possible so tab-close still ships the event.
    const body = JSON.stringify({ ...event, occurredAt: new Date().toISOString() });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${API_BASE}/proctor/events`, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(`${API_BASE}/proctor/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true
      }).catch(() => {});
    }
  }
}
