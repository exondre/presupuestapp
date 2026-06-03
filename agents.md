# PresupuestApp agent notes

## Commands
- Use Node 22 (`.nvmrc`, `package.json` engines); prefer `npm ci` for clean installs.
- `npm start` runs `ng serve` with the development config and `proxy.conf.json`.
- `npm run build` is the production build; output is `dist/app/browser/` and service worker is enabled.
- `npm run build:local` builds with `src/environments/environment.local.ts`.
- `npm test` is Karma/Jasmine watch mode in Chrome; use `npm run test:local` for one no-watch run.
- Run one spec with `npm test -- --include='**/entry.service.spec.ts'`; coverage is `npm run test:cov`.
- `npm run lint` lints `src/**/*.ts` and `src/**/*.html`; there is no separate typecheck script.

## App wiring
- This is an Angular 21 standalone Ionic 8 app (`ionic.config.json` type `angular-standalone`), not an NgModule app.
- `src/main.ts` bootstraps `AppComponent` with Ionic providers, `IonicRouteStrategy`, router preloading, and the Angular service worker registration.
- Routing starts at `src/app/app.routes.ts`, then lazy-loads `src/app/tabs/tabs.routes.ts`; primary pages are `/tabs/home`, `/tabs/balance`, `/tabs/trends`, `/tabs/history`, `/tabs/history/detail` (reuses `BalancePage`), and `/tabs/settings`.
- Core state is service-based, not NgRx: `EntryService` is the transaction source of truth (`BehaviorSubject` plus signal, localStorage key `presupuestapp:entries`); auth is optional Google Firebase auth via `src/app/auth/firebase-auth.service.ts`.

## Environment and deploy quirks
- Development file replacement uses `src/environments/environment.local.ts`; production replaces `environment.ts` with `src/environments/environment.prod.ts`.
- `environment.prod.ts` is generated from `src/environments/environment.prod.ts.template` by the GitHub merge workflow using `envsubst` and `FIREBASE_*` secrets; do not hardcode production Firebase values.
- `npm run start:debug` uses Ionic on port 8107 with HTTPS and requires the repo `cert.pem`/`key.pem` files.
- Firebase Hosting serves `dist/app/browser` and rewrites all routes to `index.html`.

## Conventions that matter
- Use imports from `@ionic/angular/standalone`; never import Ionic components from `@ionic/angular`.
- New templates should use Angular built-in control flow (`@if`, `@for`) instead of `*ngIf`/`*ngFor`.
- TypeScript is strict and Angular strict templates are enabled; component classes must end in `Page` or `Component`, selectors use `app` prefix.
- Use single quotes, trailing commas, English for identifiers/docs/commit messages, and Spanish for user-facing UI text.
- Add JSDoc docstrings for new TypeScript functions instead of documentation-only `//` comments.
- Date/month calculations intentionally use the `America/Santiago` timezone in app utilities and pages.
- For Angular/Ionic API behavior, first infer versions from `package.json` and check matching official docs before relying on memory.
