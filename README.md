# Life Is Too Short

An early-beta personal task/project manager built with **Angular 21**, **TypeScript**, **PrimeNG 21**, **Angular CDK** and **Supabase**.

Current capabilities include nested projects, task CRUD, Markdown descriptions, separate planned and due dates, Today/Upcoming views, manual ordering, responsive task cards and desktop/mobile navigation.

> The application is still under development. Do **not** assume unrestricted signup has been disabled, every RLS policy audited, or production backups restored successfully. See `documentation/project-context/Current_status.md`.

## Local development

Use a Node.js version compatible with the installed Angular version and **pnpm 9.15.9** (see `package.json`).

```bash
pnpm install --frozen-lockfile
pnpm start
```

The configured development server is `http://127.0.0.1:4300`.

```bash
pnpm testNoWatch
pnpm build:prod
git diff --check
```

For local Supabase development, `pnpm supabaseStart` and `pnpm supabaseStop` use the existing local Docker/Supabase setup. Never execute destructive development seeds against production. A backup script alone does not establish restoration readiness.

## Repository guidance

- `AGENTS.md`: engineering, Smart/Dumb architecture, security and testing conventions.
- `documentation/project-context/Current_status.md`: dated merged baseline and active work.
- `documentation/project-context/product_roadmap.md`: feature sequencing and readiness gates.
- `documentation/project-context/decisions_and_rational.md`: settled decisions.
- `documentation/project-context/ideas_and_open_questions.md`: ideas **not authorized** for automatic implementation.
- `documentation/verification/`: reports of particular tests and browser checks, with limitations.

The checked-out source, migrations and current GitHub PR state are more authoritative than a dated document.

## Product principles

Planned dates express intention; due dates express obligation. Favor Angular signals for synchronous state, typed UI outputs, feature pages/stores for orchestration and persistence, and proportional behavior-focused tests. Server/database authorization—not UI state—protects user data.
