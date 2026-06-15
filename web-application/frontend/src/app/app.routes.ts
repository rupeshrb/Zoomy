import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { AppShellComponent } from './layout/app-shell.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },

  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage)
  },
  {
    path: 'signup',
    loadComponent: () => import('./features/auth/signup.page').then(m => m.SignupPage)
  },
  {
    path: 'safe-browser-required',
    loadComponent: () =>
      import('./features/safe-browser-gate/safe-browser-required.page')
        .then(m => m.SafeBrowserRequiredPage)
  },

  // Short share link: /j/:code
  {
    path: 'j/:code',
    loadComponent: () => import('./features/join/join-redirect.page').then(m => m.JoinRedirectPage)
  },

  // Authenticated shell
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./features/home/home.page').then(m => m.HomePage)
      }
    ]
  },

  // Full-bleed meeting pages
  {
    path: 'meeting/:id/lobby',
    canActivate: [authGuard],
    loadComponent: () => import('./features/meeting/lobby.page').then(m => m.LobbyPage)
  },
  {
    path: 'meeting/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/meeting/meeting-room.page').then(m => m.MeetingRoomPage)
  },

  { path: '**', redirectTo: 'home' }
];
