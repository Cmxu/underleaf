# Underleaf - Collaborative LaTeX Editor

A modern, web-based LaTeX editor with real-time collaboration, AI assistance, and seamless Git integration.

## 🎯 Project Vision

Underleaf aims to be a comprehensive LaTeX editing platform that combines the power of Git version control with real-time collaboration and AI-powered assistance. Users can import projects via Git URLs and collaborate seamlessly with live preview capabilities.

## 🏗️ Architecture Overview

### Frontend
- **Framework**: SvelteKit with Svelte 5 and TypeScript
- **Styling**: Tailwind CSS with custom dark theme and utility classes
- **Editor**: Monaco Editor with LaTeX syntax highlighting
- **Build Tool**: Vite with optimized bundling and HMR
- **Path Aliases**: Clean imports with `$lib`, `$components`, etc.
- **Type Safety**: Strict TypeScript with svelte-check

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with strict configuration
- **Git Operations**: simple-git for repository management
- **LaTeX Compilation**: Docker containers with TeXLive
- **File Storage**: Local filesystem with user isolation
- **API Design**: RESTful endpoints with proper error handling

### Infrastructure
- **Development**: npm workspaces with concurrent dev servers
- **Containerization**: Docker and docker-compose for LaTeX environment
- **Build**: Modern ES2022 target with code splitting
- **Linting**: ESLint + Prettier with Svelte plugin

## 📋 Development Roadmap

### Phase 1: Core Infrastructure ✅
- [x] **Project Setup**
  - [x] Initialize Git repository
  - [x] Set up monorepo structure (frontend/backend)
  - [x] Configure TypeScript and build tools
  - [x] Set up Docker development environment
  - [x] Migrate frontend to SvelteKit + TypeScript + Tailwind CSS

### Phase 2: Basic Functionality 🔄
- [x] **Home Page & Git Integration**
  - [x] Design and implement landing page UI
  - [x] Create Git URL input form with validation
  - [x] Implement server-side Git cloning functionality
  - [x] Add project import progress indicators
  - [ ] Handle common Git authentication methods

- [x] **Core Editor Interface**
  - [x] Design split-screen layout (editor + preview)
  - [x] Integrate Monaco Editor with TypeScript
  - [x] Basic file tree navigation component
  - [ ] Add functional file operations (create, delete, rename)
  - [x] Set up LaTeX compilation pipeline

- [ ] **PDF Preview System**
  - [x] Implement PDF generation from LaTeX source
  - [ ] Create responsive PDF viewer component
  - [ ] Add automatic recompilation on file changes
  - [x] Implement error handling and display

### Phase 3: User Experience Enhancement 🎨
- [ ] **Advanced UI/UX**
  - [ ] Implement theme system (light/dark modes)
  - [ ] Add keyboard shortcuts and hotkeys
  - [ ] Create customizable editor settings
  - [ ] Design responsive mobile interface
  - [ ] Add loading states and progress indicators

- [ ] **Editor Features**
  - [ ] LaTeX autocomplete and snippets
  - [ ] Bracket matching and auto-pairing
  - [ ] Find and replace functionality
  - [ ] Multiple cursor support
  - [ ] Code folding capabilities

### Phase 4: Collaboration Features 🤝
- [ ] **Real-time Collaboration**
  - [ ] Implement operational transformation (OT) or CRDT
  - [ ] Add user presence indicators
  - [ ] Create real-time cursor tracking
  - [ ] Implement conflict resolution
  - [ ] Add user authentication system

- [ ] **Project Management**
  - [ ] User accounts and project ownership
  - [ ] Project sharing and permissions
  - [ ] Version history and rollback
  - [ ] Branch support for Git projects
  - [ ] Comment and annotation system

### Phase 5: AI Integration 🤖
- [ ] **AI-Powered Features**
  - [ ] LaTeX code suggestions and completion
  - [ ] Grammar and style checking
  - [ ] Automatic citation formatting
  - [ ] Document structure optimization
  - [ ] Error explanation and fixes

- [ ] **Advanced AI Features**
  - [ ] Natural language to LaTeX conversion
  - [ ] Document summarization
  - [ ] Reference and bibliography management
  - [ ] Mathematical equation assistance
  - [ ] Figure and table generation

### Phase 6: Production & Scaling 🚀
- [ ] **Performance Optimization**
  - [ ] Implement lazy loading for large documents
  - [ ] Add caching strategies for compiled PDFs
  - [ ] Optimize WebSocket connections
  - [ ] Database query optimization
  - [ ] CDN integration for assets

- [ ] **Production Deployment**
  - [ ] Set up production infrastructure
  - [ ] Implement monitoring and logging
  - [ ] Add backup and disaster recovery
  - [ ] Security hardening and auditing
  - [ ] Performance monitoring and analytics

## 🛠️ Technology Stack

### Frontend Technologies
- **Svelte** - Component framework
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **Monaco Editor** - VS Code editor for the web
- **Svelte Query** - Data fetching and caching
- **Framer Motion** - Animation library
- **Svelte Forms** - Form handling
- **Radix UI** - Accessible component primitives

### Backend Technologies
- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **TypeScript** - Type-safe JavaScript
- **Prisma** - Database ORM and toolkit
- **PostgreSQL** - Relational database
- **Socket.io** - Real-time communication
- **simple-git** - Git operations
- **Multer** - File upload handling

### DevOps & Tools
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Nginx** - Reverse proxy and load balancer
- **GitHub Actions** - CI/CD pipeline
- **ESLint & Prettier** - Code linting and formatting
- **Jest & Testing Library** - Testing frameworks

## 📁 Project Structure

```
underleaf/
├── frontend/                 # Svelte application
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom stores or hooks
│   │   ├── utils/          # Utility functions
│   │   ├── stores/         # State management
│   │   └── types/          # TypeScript definitions
│   ├── public/             # Static assets
│   └── package.json
├── backend/                 # Node.js server
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── controllers/    # Route handlers
│   │   ├── services/       # Business logic
│   │   ├── models/         # Database models
│   │   ├── middleware/     # Express middleware
│   │   └── utils/          # Utility functions
│   ├── prisma/             # Database schema
│   └── package.json
├── shared/                  # Shared types and utilities
├── docker/                  # Docker configurations
├── docs/                    # Documentation
└── scripts/                 # Build and deployment scripts
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm/yarn
- Docker and Docker Compose
- Git
- PostgreSQL (or use Docker)

### Development Setup
```bash
# Clone the repository
git clone <repository-url>
cd underleaf

# Install dependencies (when package.json files are created)
npm install

# Set up environment variables
cp .env.example .env
# Directory where cloned repositories will be stored
# (can be customized via REPO_BASE_PATH)

# Start development servers
npm run dev
```

## 📈 Progress Tracking

### Current Status: 🔄 **Phase 2 - Basic Functionality**

**Recently Completed:**
- [x] Complete migration to SvelteKit + TypeScript + Tailwind CSS
- [x] Modern development environment with Vite and HMR
- [x] Home page with Git repository cloning functionality
- [x] Basic editor interface with Monaco Editor integration
- [x] LaTeX compilation pipeline with Docker
- [x] Split-screen layout with file tree and PDF preview placeholders

**Currently Working On:**
- [ ] Enhanced file tree with actual file browsing
- [ ] Improved Monaco Editor with LaTeX features
- [ ] PDF preview functionality
- [ ] File operations (create, delete, rename)

**Next Up:**
- Real-time collaboration features
- Advanced editor features and shortcuts
- User authentication and project management

## 🤝 Contributing

This project follows standard Git workflow practices:
1. Create feature branches from `main`
2. Make targeted commits with clear messages
3. Submit pull requests for code review
4. Maintain code quality with linting and testing

## 📝 Notes & Decisions

### Technical Decisions
- **Editor Choice**: Monaco Editor chosen for VS Code-like experience
- **Database**: PostgreSQL for robust relational data management
- **Real-time**: Socket.io for proven WebSocket implementation
- **LaTeX Compilation**: Docker containers for isolated, reproducible builds

### Future Considerations
- **Scaling**: Microservices architecture for high-traffic scenarios
- **Security**: End-to-end encryption for sensitive documents
- **Internationalization**: Multi-language support for global users
- **Mobile**: Progressive Web App (PWA) capabilities

## 📄 License

[License to be determined]

---

**Last Updated:** $(date +%Y-%m-%d)
**Version:** 0.1.0 (Development) 