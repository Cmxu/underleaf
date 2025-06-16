# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Underleaf is a collaborative LaTeX editor with real-time collaboration, AI assistance, and Git integration. Users can import LaTeX projects via Git URLs and collaborate with live preview capabilities.

## Architecture

**Multi-Tenant Container Architecture**: Frontend-Backend separation with per-user Docker isolation
- **Frontend**: SvelteKit + TypeScript SPA with Tailwind CSS (port 5173)
- **Backend**: Express.js REST API with TypeScript (port 3001)  
- **LaTeX Processing**: Isolated per-user Docker containers with TeXLive
- **Reverse Proxy**: Traefik for routing and load balancing (port 80)
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

# Type checking across all packages
npm run type-check --workspaces
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

### Backend-Specific Commands
```bash
# Backend only (from /backend)  
cd backend && npm run dev

# Build backend
npm run build

# Type checking
npm run type-check
```

### Docker Development
```bash
# Start full multi-container environment
docker-compose up

# Setup container infrastructure
./scripts/setup-containers.sh

# Monitor container status
./scripts/monitor-containers.sh
```

## Key Technologies

### Frontend Stack
- **SvelteKit**: Full-stack framework with file-based routing
- **Svelte 5**: Modern reactive component framework
- **TypeScript**: Strict type safety with ES2022 target
- **Tailwind CSS**: Utility-first styling with custom theme
- **Monaco Editor**: VS Code editor for LaTeX with syntax highlighting
- **Supabase**: Authentication and user management

### Backend Stack
- **Express.js**: Web framework with TypeScript
- **Dockerode**: Docker API integration for container management
- **simple-git**: Git operations for repository management
- **tar-stream**: File extraction from containers

### Infrastructure
- **Docker**: Container isolation for LaTeX environments
- **Traefik**: Reverse proxy with automatic service discovery
- **TeXLive**: Full LaTeX distribution in containers
- **PDF.js**: Client-side PDF rendering

## Container Architecture

**Multi-Tenant Design**: Each user gets isolated LaTeX environment
- User containers are created on-demand per repository
- Docker volumes persist repository data across sessions
- Container lifecycle automatically managed by backend
- Traefik routes traffic to user-specific containers
- Resources isolated between users for security

**Container Service**: Located in `backend/src/services/containerService.ts`
- Manages user container lifecycle
- Handles volume mounting and data persistence
- Executes commands in isolated environments
- Provides cleanup and monitoring capabilities

## API Architecture

The application uses shared TypeScript interfaces between frontend/backend:

### Core Endpoints
- `POST /api/clone` - Clone Git repositories with authentication
- `POST /api/compile` - Compile LaTeX documents via user containers
- `GET /api/files/:userId/:repoName` - File tree navigation
- `GET /api/files/:userId/:repoName/content` - File content reading
- `PUT /api/files/:userId/:repoName/content` - File content saving
- `GET /api/files/:userId/:repoName/pdf/*` - PDF serving with streaming

### Git Operations
- `GET /api/git/:userId/:repoName/status` - Git status with change tracking
- `POST /api/git/:userId/:repoName/commit` - Commit changes
- `POST /api/git/:userId/:repoName/push` - Push to remote
- `POST /api/git/:userId/:repoName/pull` - Pull from remote

### Claude AI Integration
- `GET /api/claude/setup` - Check Claude authentication status
- `POST /api/claude/interactive-setup` - Start Claude authentication flow
- `POST /api/claude/verify-code` - Submit verification code
- `POST /api/claude` - Send messages to Claude AI

### Container Management
- `POST /api/containers/:userId/:repoName/ensure` - Ensure container is running
- `GET /api/containers/stats` - Global container statistics
- `DELETE /api/containers/:userId/:repoName` - Remove user container

**Shared Types**: Located in `frontend/src/lib/types/api.ts` and `backend/src/types/api.ts`

## File Organization

### SvelteKit Structure
- `frontend/src/routes/` - SvelteKit file-based routing
  - `+page.svelte` - Home page with repository cloning
  - `editor/+page.svelte` - LaTeX editor with Monaco integration
  - `auth/callback/+page.svelte` - Supabase authentication callback
  - `+layout.svelte` - Root layout component
- `frontend/src/lib/` - Library code with path aliases (`$lib`)
  - `components/` - Reusable Svelte components (`$components`)
    - `AiChatPanel.svelte` - Claude AI chat interface
    - `AuthModal.svelte` - Authentication modal
    - `FileTree.svelte` - File navigation component
    - `PdfPreview.svelte` - PDF viewer component
  - `utils/` - Utility functions including API client (`$utils`)
  - `types/` - TypeScript type definitions (`$types`)
  - `stores/` - Svelte stores for state management (`$stores`)
- `frontend/src/app.html` - HTML template
- `frontend/src/app.css` - Global styles with Tailwind

### Backend Structure
- `backend/src/index.ts` - Express server with comprehensive API endpoints
- `backend/src/services/containerService.ts` - Container management service
- `backend/src/types/api.ts` - API interface definitions
- `docker/latex/Dockerfile` - LaTeX container configuration

### Infrastructure
- `docker-compose.yml` - Multi-service orchestration
- `scripts/` - Setup and monitoring scripts for containers
- `frontend/static/pdfjs/` - PDF.js library for client-side rendering

## Authentication & Security

**Supabase Integration**: Complete authentication system
- User registration and login
- Session management with secure cookies
- Protected routes and API endpoints
- Authentication callbacks and redirects

**Multi-User Isolation**: Container-based security
- Each user gets isolated file system access
- Docker volumes prevent cross-user access
- Path validation prevents directory traversal
- Container cleanup on session end

## Development Experience

### Hot Reloading & Build
- **Vite HMR**: Instant updates for Svelte, TypeScript, and CSS
- **ts-node-dev**: Backend hot reloading with TypeScript
- **Code Splitting**: Monaco Editor loaded as separate chunk
- **Modern Build**: ES2022 target with esbuild minification

### Code Quality
- **ESLint**: Configured for Svelte and TypeScript
- **Prettier**: Code formatting with Svelte plugin
- **Type Checking**: Real-time validation with svelte-check
- **Path Aliases**: Clean imports with `$lib`, `$components`, etc.

### Styling System
- **Tailwind CSS**: Utility-first with custom dark theme
- **Component Classes**: Reusable button and input styles
- **Responsive Design**: Mobile-first approach
- **Modern Effects**: Backdrop blur, shadows, animations

## Environment Configuration

### Development Setup
- Node.js 18+ required for ES2022 features
- Docker required for LaTeX compilation
- Ports 80 (Traefik), 3001 (backend), 5173 (frontend)

### Environment Variables
- `VITE_API_URL` - Backend API endpoint (default: http://localhost:3001)
- `PUBLIC_SUPABASE_URL` - Supabase project URL
- `PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `ANTHROPIC_API_KEY` - Claude AI API key for backend

### Claude AI Setup
- Set `ANTHROPIC_API_KEY` in backend environment
- Get API key from [Anthropic Console](https://console.anthropic.com/)
- Claude Code CLI installed in LaTeX containers
- Interactive authentication flow through UI

## Repository Management

**Git Integration**: Full Git workflow support
- Repository cloning with credential handling
- Overleaf and GitHub/GitLab authentication
- Commit, push, pull operations through containers
- Status tracking with change detection

**File Operations**: Complete file management
- Real-time file tree navigation
- File content editing and saving
- PDF compilation and preview
- Directory creation and file operations

## Key Implementation Details

**Container Lifecycle**: Automatic management in `containerService.ts`
- On-demand container creation per user/repository
- Volume persistence across container restarts
- Cleanup policies to prevent resource exhaustion
- Health monitoring and automatic recovery

**PDF Processing**: Secure file serving
- Direct container file extraction using Docker API
- Streaming PDF delivery to client
- PDF.js integration for client-side rendering
- Security validation and path checking

**Real-time Features**: Live collaboration preparation
- File change detection through Git status
- Container state synchronization
- Event-driven architecture for updates