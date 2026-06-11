# Project Overview

BlitzVault is a modern cloud storage and collaboration platform inspired by Google Drive, Dropbox, Notion, and Linear.

Focus:
- Modern UX
- Realtime collaboration
- Scalable architecture
- AI-powered productivity
- Enterprise-ready security

---

# Tech Stack

Frontend:
- Next.js
- TypeScript
- TailwindCSS
- ShadCn UI

Backend:
- Node.js
- Express/NestJS
- PostgreSQL
- Prisma/TypeORM

Auth:
- Clerk
- OpenFGA

Storage:
- AWS S3 / Cloudflare R2 / Cloudinary

---

# Architecture Principles

- Feature-first architecture
- Shared packages for reusable logic
- Avoid business logic inside UI
- Thin controllers
- Service-layer driven backend
- Strong separation of concerns
- Modular authorization system


# OpenFGA Standards

- OpenFGA is the central authorization engine
- Avoid hardcoded permission logic
- Use relationship-based access control
- Design for multi-tenant scalability
- Permission inheritance must be modeled carefully
- Authorization checks should be abstracted into services


# Performance Rules

- Avoid unnecessary re-renders
- Use server actions strategically
- Prefer pagination over large queries
- Use optimistic updates carefully
- Virtualize large file lists
- Cache permission checks where appropriate


# Backend Standards

- Controllers should stay thin
- Business logic belongs in services
- Validation at API boundary
- Typed API contracts only
- Centralized error handling
- Audit logging for critical actions

# Frontend Standards

- Feature-based folders
- Shared UI package
- Reusable hooks
- Accessibility-first
- Keyboard shortcuts supported
- Mobile responsive
- Proper skeleton states

# Engineering Standards

- Strict TypeScript only
- No any types
- Reusable components first
- Feature-based architecture
- Validation everywhere
- Zod for schemas
- React Query for server state
- Proper loading/error states
- Mobile responsive UI mandatory

---

# UI Standards

Inspired by:
- Linear
- Vercel
- Notion

Rules:
- Minimal UI
- Smooth animations
- Consistent spacing
- Keyboard-first UX
- Skeleton loaders
- Empty states
- Accessibility support

---

# Important Rules

- Never rewrite working architecture unnecessarily
- Prefer incremental refactors
- Avoid tight coupling
- Optimize for scalability
- Think production-first