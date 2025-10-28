# Project info
Project name: PresupuestApp
See README.md for further info

## Tech Stack

- **Framework:** Angular 20 with Ionic 8 UI components.
- **Mobile runtime:** Capacitor 7 (core, app, haptics, keyboard, status bar plugins).
- **Language:** TypeScript 5 with RxJS 7 for reactive programming and Zone.js for change detection.
- **Build tooling:** Angular CLI 20, Angular DevKit build system, Ionic Angular Toolkit.
- **Linting:** ESLint 9 with Angular ESLint presets and TypeScript ESLint plugins.
- **Testing:** Jasmine 5 unit tests executed with Karma 6 and Chrome launcher HTML reporter.

## Guidelines
- Prefer single quotes
- Use trailing commas
- Use descriptive variable/function names
- Documentation for all new TypeScript functions MUST use JSDoc docstrings, not `//` comments
- Use English as the only language for variable/function names, all documentation and commit messages
- Use Spanish for user-facing purposes
- Use Angular's built-in control flow syntax (`@if`, `@for`, etc.) instead of deprecated structural directives such as `*ngIf` or `*ngFor` when writing new templates.
- Import for Ionic framework Angular components must always be done from `@ionic/angular/standalone`. Imports from `@ionic/angular` are strictly forbidden.
