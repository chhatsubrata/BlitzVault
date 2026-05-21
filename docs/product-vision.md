# Product Vision

## What BlitzVault is

Modern cloud storage + collaboration platform. Google Drive shape, Linear/Notion polish, enterprise-grade authorization, AI-native productivity.

## Target users

- **Individual creators / power users** — want fast UI, keyboard-first, AI assist on personal files.
- **Small teams (2–50)** — want shared workspaces, real-time collab, granular sharing without admin overhead.
- **Mid-market orgs (50–500)** — want OpenFGA-grade RBAC, audit logs, SSO, compliance posture.

Not targeting enterprise procurement (Box/Egnyte territory) at MVP.

## Core promise

> "Drive-level reliability, Linear-level UX, AI you actually use."

## Differentiators

1. **Fine-grained ReBAC** via OpenFGA — share any file/folder at any depth without admin gymnastics.
2. **Keyboard-first** — every action reachable from `⌘K` or hotkey. No mouse-required flow.
3. **AI built-in** — semantic search, summarization, smart tagging from day one, not a bolt-on.
4. **Realtime everywhere** — presence on files, live folder updates, live comments.
5. **Modern stack** — Next.js 16, React 19, Postgres, no legacy SOAP/SAML baggage.

## Non-goals (explicit)

- Office-suite editing (Docs/Sheets/Slides). Integrate, don't rebuild.
- Email or calendar.
- On-prem deployment at MVP.
- Mobile native apps at MVP (PWA only).

## Success metrics

- TTFB on file list < 200ms p95.
- Upload-to-visible < 2s for files ≤ 50MB.
- D7 retention ≥ 35% MVP, ≥ 50% by Phase 6.
- Median session uses keyboard shortcut ≥ 3 times (UX validation).
- OpenFGA `check` p95 < 20ms cached, < 80ms cold.

## Brand voice

Calm, technical, confident. No emojis in UI copy. Sentence case. Direct verbs.

## Inspirations

Linear (motion, density, command palette), Notion (sharing model UX), Vercel (dashboard polish), Raycast (keyboard ergonomics), Framer (delight without bloat), Dropbox (file fundamentals).
