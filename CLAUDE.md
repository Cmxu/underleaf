# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Underleaf is a collaborative LaTeX editor with real-time collaboration, AI assistance, and Git integration. Users can import LaTeX projects via Git URLs and collaborate with live preview capabilities.

## Architecture

**Monorepo Structure**: Frontend-Backend separation with Docker containerization
- **Frontend**: SvelteKit + TypeScript SPA with Tailwind CSS (port 5173)
- **Backend**: Express.js REST API with TypeScript (port 3000)  
- **LaTeX Processing**: Isolated Docker containers with TeXLive
- **Development**: npm workspaces with concurrent dev servers

## Development Commands

### Primary Development
```bash
# Start both frontend and backend dev servers
npm run dev

# Build all packages
npm run build --workspaces

# Run linting across all packages
npm run lint --workspaces
```

### Frontend-Specific Commands
```bash
# Development server with hot reloading
cd frontend && npm run dev

# Type checking
npm run check

# Linting and formatting
npm run lint
npm run lint:fix

# SvelteKit sync
svelte-kit sync
```

### Individual Services
```bash
# Backend only (from /backend)  
cd backend && npm run dev

# Docker services
docker-compose up
```

## Key Technologies

- **Frontend**: SvelteKit, Svelte 5, TypeScript, Tailwind CSS, Monaco Editor
- **Backend**: Express.js, TypeScript, simple-git, fs-extra
- **Infrastructure**: Docker, docker-compose, TeXLive
- **Build**: Vite with SvelteKit, ts-node-dev (backend), ESLint + Prettier
- **Styling**: Tailwind CSS with custom dark theme and modern components

## API Architecture

The application uses shared TypeScript interfaces between frontend/backend:

**Core Endpoints**:
- `POST /api/clone` - Clone Git repositories 
- `POST /api/compile` - Compile LaTeX documents via Docker

**Shared Types**: Located in `frontend/src/lib/types/api.ts` and `backend/src/types/api.ts`

## File Organization

### SvelteKit Structure
- `frontend/src/routes/` - SvelteKit file-based routing
  - `+page.svelte` - Home page with repository cloning
  - `editor/+page.svelte` - LaTeX editor with Monaco integration
  - `+layout.svelte` - Root layout component
- `frontend/src/lib/` - Library code with path aliases
  - `components/` - Reusable Svelte components (`$components`)
  - `utils/` - Utility functions including API client (`$utils`)
  - `types/` - TypeScript type definitions (`$types`)
  - `stores/` - Svelte stores for state management (`$stores`)
- `frontend/src/app.html` - HTML template
- `frontend/src/app.css` - Global styles with Tailwind

### Backend Structure
- `backend/src/index.ts` - Express server with Git/LaTeX endpoints
- `backend/src/types/` - API interface definitions
- `docker/` - Container configurations for LaTeX compilation

## Modern Features

### Frontend Optimizations
- **Code Splitting**: Monaco Editor loaded as separate chunk
- **Modern Build**: ES2022 target with esbuild minification
- **Path Aliases**: Clean imports with `$lib`, `$components`, etc.
- **Type Safety**: Strict TypeScript with svelte-check
- **Performance**: Vite HMR with optimized dependencies

### Styling System
- **Tailwind CSS**: Utility-first CSS framework
- **Dark Theme**: Custom dark color palette with design tokens
- **Component Classes**: Reusable button and input styles
- **Responsive Design**: Mobile-first approach
- **Modern Effects**: Backdrop blur, shadows, and smooth animations

### Development Experience
- **Hot Reloading**: Instant updates for Svelte, TypeScript, and CSS
- **Linting**: ESLint with Svelte plugin and Prettier formatting
- **Type Checking**: Real-time TypeScript validation
- **Error Handling**: Global error boundaries and enhanced logging

## Repository Management

- Cloned repos stored in `../repos/{userId}/{repoName}/` structure
- Git operations via simple-git library
- LaTeX compilation through Docker exec to latex container
- User isolation prepared for future authentication

## Environment Configuration

- Copy `frontend/.env.example` to `frontend/.env` for local development
- `VITE_API_URL` - Backend API endpoint (default: http://localhost:3000)
- Environment variables prefixed with `VITE_` are exposed to client
- Use `PUBLIC_` prefix for SvelteKit public environment variables

### Claude AI Integration

- Set `ANTHROPIC_API_KEY` environment variable to enable Claude AI features
- Get your API key from [Anthropic Console](https://console.anthropic.com/)
- Claude Code CLI (v1.0.18) is installed in LaTeX containers for AI assistance
- AI panel allows natural language interaction with your LaTeX projects

## Environment Requirements

- Node.js 18+ (for ES2022 features and SvelteKit)
- Docker (required for LaTeX compilation)
- Ports 3000 (backend) and 5173 (frontend) available
- Sufficient disk space for Git repository storage