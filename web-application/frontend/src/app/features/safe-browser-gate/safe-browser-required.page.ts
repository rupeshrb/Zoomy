import { Component, HostBinding, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MeetingService } from '../../core/meeting.service';
import { AuthService } from '../../core/auth.service';
import { SafeAgentClient } from '../../core/safe-agent.client';
import { MButtonComponent } from '../../shared/ui/m-button.component';
import { MIconComponent } from '../../shared/ui/m-icon.component';

@Component({
  selector: 'page-safe-browser-required',
  standalone: true,
  imports: [CommonModule, MButtonComponent, MIconComponent],
  template: `
    <div class="wrap">
      <div class="card">
        <div class="badge"><m-icon name="verified_user" [size]="36" /></div>
        <h1>This is a proctored interview</h1>
        <p class="sub">
          To keep the playing field level, you must run the
          <strong>Zoomy Safe Agent</strong> — a lightweight desktop app that runs
          alongside your browser and detects hidden AI overlays and other
          on-screen cheating tools. Your meeting stays in this browser.
        </p>

        <ol class="steps">
          <li [class.active]="step()>=1">
            <span class="n">1</span>
            <div>
              <div class="t">Download the Safe Agent</div>
              <div class="d">Small desktop app · runs next to your browser</div>
            </div>
          </li>
          <li [class.active]="step()>=2">
            <span class="n">2</span>
            <div>
              <div class="t">Open it &amp; sign in</div>
              <div class="d">Use this same account and enter your meeting code</div>
            </div>
          </li>
          <li [class.active]="step()>=3">
            <span class="n">3</span>
            <div>
              <div class="t">This page continues automatically</div>
              <div class="d">Once the agent connects, your meeting opens here</div>
            </div>
          </li>
        </ol>

        <div class="agent-detect" [class.ok]="agentDetected()">
          <m-icon [name]="agentDetected() ? 'check_circle' : 'desktop_windows'" [size]="18" />
          <span>{{ agentDetected() ? 'Safe Agent detected on this computer' : 'Safe Agent not detected yet' }}</span>
        </div>

        <div class="actions">
          <button m-button variant="filled" size="lg" class="action" icon="link"
                  (click)="connectAgent()" [disabled]="connecting()">
            {{ connecting() ? 'Connecting…' : 'Connect with proctor agent' }}
          </button>
          <button m-button variant="outline" size="lg" class="action" icon="download" (click)="downloadWin()">
            Download Safe Agent
          </button>
        </div>

        <p class="agent-wait" *ngIf="waiting()">
          <span class="spinner"></span>
          Connecting to the Safe Agent… your interview will open automatically.
        </p>

        <p class="hint" *ngIf="hint()">
          <m-icon name="info" [size]="18" />
          {{ hint() }}
        </p>

        <div class="footer">
          <a m-button variant="text" class="back" icon="arrow_back" (click)="back()">Back</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .wrap {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 24px;
      background:
        radial-gradient(900px 500px at 0% 0%, #e8f0fe 0%, transparent 60%),
        radial-gradient(800px 400px at 100% 100%, #e6f4ea 0%, transparent 60%),
        var(--m-bg-light);
    }
    .card {
      background: var(--m-bg-light); border: 1px solid var(--m-divider-light);
      border-radius: 28px; box-shadow: var(--m-e2);
      max-width: 720px; width: 100%; padding: 48px;
    }
    .badge {
      width: 72px; height: 72px; border-radius: 50%;
      background: #e6f4ea; color: #137333;
      display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;
    }
    h1 { font-weight: 400; font-size: 28px; margin: 0 0 8px; }
    .sub { color: var(--m-text-ink-muted); font-size: 15px; margin: 0 0 28px; max-width: 560px; }

    .steps { list-style: none; padding: 0; margin: 0 0 32px; display: flex; flex-direction: column; gap: 8px; }
    .steps li {
      display: flex; gap: 16px; align-items: center;
      padding: 14px 16px; border-radius: 12px;
      background: var(--m-surface-light); color: var(--m-text-ink-muted);
      transition: background-color .15s, color .15s;
    }
    .steps li.active { background: #e8f0fe; color: var(--m-text-ink); }
    .n {
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--m-divider-light); color: var(--m-text-ink-muted);
      display: inline-flex; align-items: center; justify-content: center;
      font-weight: 500; flex-shrink: 0;
    }
    .steps li.active .n { background: var(--m-primary-700); color: white; }
    .t { font-size: 14px; font-weight: 500; }
    .d { font-size: 12px; }

    .downloads { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .open { width: 100%; justify-content: center; margin-bottom: 16px; }

    .agent-detect {
      display: inline-flex; align-items: center; gap: 8px; margin-bottom: 14px;
      padding: 8px 14px; border-radius: 999px; font-size: 13px; font-weight: 500;
      background: var(--m-surface-light); color: var(--m-text-ink-muted);
    }
    .agent-detect.ok { background: #e6f4ea; color: #137333; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .actions .action { flex: 1 1 220px; justify-content: center; }

    .hint {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 12px; background: #fef7e0; color: #5f3b00;
      border-radius: 8px; font-size: 13px; margin: 0 0 16px;
    }

    .back { color: var(--m-text-ink-muted); }
    .footer {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; margin-top: 20px; padding-top: 16px;
      border-top: 1px solid var(--m-divider-light);
    }
    .agent-wait {
      display: flex; align-items: center; gap: 10px; margin: 12px 0 0;
      padding: 12px; background: #e8f0fe; color: #1a4fa0;
      border-radius: 8px; font-size: 13px;
    }
    .spinner {
      width: 16px; height: 16px; flex: 0 0 auto; border-radius: 50%;
      border: 2px solid #b3ccf5; border-top-color: #1a73e8;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 600px) {
      .card { padding: 32px 24px; border-radius: 20px; }
      .downloads { flex-direction: column; }
      .downloads button { width: 100%; justify-content: center; }
    }
  `]
})
export class SafeBrowserRequiredPage implements OnInit, OnDestroy {
  @HostBinding('class.m-light') readonly light = true;
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private meet = inject(MeetingService);
  private auth = inject(AuthService);
  private agent = inject(SafeAgentClient);

  step = signal(1);
  hint = signal('');
  /** The desktop Safe Agent is installed + running on this computer. */
  agentDetected = signal(false);
  /** A handshake is in flight. */
  connecting = signal(false);
  /** Waiting for the backend to confirm the agent connected. */
  waiting = signal(false);

  private poll?: any;

  ngOnInit() {
    const id = this.route.snapshot.queryParamMap.get('id') || '';
    if (!id) return;
    // Each tick: refresh local agent detection AND check whether the backend
    // sees the agent connected (which releases the gate automatically).
    const tick = async () => {
      const st = await this.agent.status();
      this.agentDetected.set(!!st?.running);
      const ok = await this.meet.safeAgentConnected(id);
      if (ok) {
        this.waiting.set(false);
        clearInterval(this.poll);
        const next = this.route.snapshot.queryParamMap.get('next') || '/home';
        this.router.navigateByUrl(next);
      }
    };
    void tick();
    this.poll = setInterval(tick, 3000);
  }

  ngOnDestroy() {
    clearInterval(this.poll);
  }

  back() { history.length > 1 ? history.back() : this.router.navigate(['/home']); }

  downloadWin() {
    this.step.set(2);
    // Placeholder — backend will serve the signed installer.
    const a = document.createElement('a');
    a.href = '/downloads/zoomy-safe-agent-setup.exe';
    a.download = 'zoomy-safe-agent-setup.exe';
    a.click();
    this.hint.set('Install and open the Safe Agent, then click “Connect with proctor agent”. This page continues automatically.');
  }

  /**
   * Hand the interview session to the locally-running Safe Agent. The agent
   * connects to the backend; the polling loop above then releases the gate.
   */
  async connectAgent() {
    const id = this.route.snapshot.queryParamMap.get('id') || '';
    const token = this.auth.accessToken();
    if (!id || !token) { this.hint.set('Your session expired. Please sign in again.'); return; }

    this.connecting.set(true);
    this.hint.set('');
    try {
      const res = await this.agent.handshake(token, id, this.auth.user()?.name);
      if (res.ok) {
        this.step.set(3);
        this.agentDetected.set(true);
        this.waiting.set(true);
        this.hint.set('Connected to the Safe Agent — opening your interview…');
      } else {
        this.hint.set(res.error || 'The Safe Agent could not connect. Please try again.');
      }
    } catch {
      this.agentDetected.set(false);
      this.hint.set("We couldn't find the Safe Agent on this computer. Download and open it, then click Connect again.");
    } finally {
      this.connecting.set(false);
    }
  }
}
