# BlitzVault

A cloud storage drive clone application with a Next.js frontend and Express/TypeScript backend.

## Project Structure

```
BlitzVault/
├── frontend/          # Next.js frontend (React, TypeScript)
├── backend/           # Express.js backend (TypeScript)
└── Rnds/              # Experiments/sandbox (ignored by git)
```

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Express.js, TypeScript
- **Package Manager**: pnpm

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

### Frontend Setup

```bash
cd frontend
pnpm install
pnpm dev
```

The frontend runs on [http://localhost:3000](http://localhost:3000).

### Backend Setup

```bash
cd backend
pnpm install
# Copy .env.example to .env and configure your variables
pnpm dev
```

## Environment Variables

### Frontend

Create a `.env` file in the `frontend/` directory with required variables.

### Backend

Copy `backend/.env.example` to `backend/.env` and configure your variables.

## Scripts

### Frontend

| Command        | Description              |
| -------------- | ------------------------ |
| `pnpm dev`     | Start development server |
| `pnpm build`   | Build for production     |
| `pnpm start`   | Start production server  |
| `pnpm lint`    | Run ESLint               |

### Backend

| Command        | Description              |
| -------------- | ------------------------ |
| `pnpm dev`     | Start development server |
| `pnpm build`   | Build TypeScript         |
| `pnpm start`   | Start production server  |
