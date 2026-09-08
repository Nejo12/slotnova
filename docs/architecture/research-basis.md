# Architecture Research Basis

Research checkpoint: 2026-09-08.

This document records the external primary-source basis for Phase 0 decisions. It is not a substitute for ADRs; it makes the reasoning auditable and easier to refresh before major upgrades.

## Planning / agent workflow

- GitHub Spec Kit documents the canonical sequence `constitution → specify → plan → tasks → implement` and supports many coding-agent integrations, including Claude Code: https://github.com/github/spec-kit
- Superpowers describes itself as an agentic software-development methodology built from composable skills and provides an official Claude Code plugin installation path: https://github.com/obra/superpowers

Decision: Spec Kit is the durable specification/planning layer; Superpowers is execution discipline. Neither overrides committed ADRs/specifications silently.

## Frontend/runtime

- React official version page identifies React 19.2 as the latest React version: https://react.dev/versions
- Vite announced stable Vite 8 on 2026-03-12, using Rolldown as the unified bundler: https://vite.dev/blog/announcing-vite8
- Node.js 24 is an LTS line (Krypton) with support through April 2028; production runtime should track an up-to-date patched 24.x release rather than a stale exact patch: https://nodejs.org/en/download/archive/v24

Decision: React 19.2 / Vite 8 / Node 24 LTS are the Phase 0 baseline unless compatibility verification before bootstrap identifies a concrete blocker.

## Backend

NestJS documents Fastify as a supported built-in HTTP adapter and notes Fastify can be a preferable choice when performance matters: https://docs.nestjs.com/techniques/performance

Decision: NestJS modular structure + Fastify adapter is preferred over unstructured bare Fastify for a large TypeScript codebase.

## Database

PostgreSQL official documentation lists PostgreSQL 18 as the current supported major line; 19 is still development/beta as of this checkpoint: https://www.postgresql.org/docs/18/

Decision: PostgreSQL 18 is the baseline production major. Patch updates should track supported security/bug-fix releases.

## Refresh policy

Before the Phase 1 bootstrap PR, verify:

- current Node 24 LTS patch
- current compatible pnpm/Turborepo releases
- current React 19.2 patch
- current Vite 8 patch
- current NestJS/Fastify compatibility
- current Drizzle/PostgreSQL 18 compatibility
- current Vitest/Playwright/Storybook compatibility

Lock exact versions in the repository only after that compatibility check. Major-version upgrades later require focused review and, where architecturally meaningful, an ADR update.
