# Multi-Container Architecture

This document describes Underleaf's multi-tenant container architecture that provides isolated LaTeX environments for each user while routing all traffic through a single port.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Internet                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │ Port 80/443
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Traefik Proxy                              │
│                  (Load Balancer)                               │
└─────────────┬───────────────────────┬───────────────────────────┘
              │                       │
              ▼                       ▼
┌─────────────────────┐    ┌─────────────────────┐
│     Frontend        │    │      Backend        │
│   (SvelteKit)       │    │   (Node.js/Express) │
│   Port: 5173        │    │   Port: 3000        │
└─────────────────────┘    └─────────┬───────────┘
                                     │ Docker API
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                User Containers & Repository Volumes            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ User A      │  │ User B      │  │ User C      │            │
│  │ LaTeX Env   │  │ LaTeX Env   │  │ LaTeX Env   │    ...     │
│  │ + Claude    │  │ + Claude    │  │ + Claude    │            │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│         │                │                │                   │
│         └────────────────┼────────────────┘                   │
│                          ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │         Repository Volume (Shared Workspace)           │  │
│  │           Contains: LaTeX files, assets, etc.          │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 🐳 Container Types

### 1. Infrastructure Containers

#### Traefik (Reverse Proxy)
- **Purpose**: Routes HTTP traffic to appropriate services
- **Port**: 80 (HTTP), 443 (HTTPS), 8080 (Dashboard)
- **Features**:
  - Automatic service discovery
  - Load balancing
  - SSL termination (when configured)
  - Dashboard for monitoring

#### Backend (API Server)
- **Purpose**: Handles API requests and manages user containers
- **Port**: 3000 (internal)
- **Features**:
  - User authentication
  - Git operations
  - Container lifecycle management
  - LaTeX compilation orchestration

#### Frontend (Web Interface)
- **Purpose**: Serves the user interface
- **Port**: 5173 (internal)
- **Features**:
  - SvelteKit application
  - Monaco editor
  - Real-time collaboration interface

### 2. User Containers & Repository Volumes

#### LaTeX Environment (Per User)
- **Purpose**: Isolated LaTeX compilation environment per user-repository
- **Base Image**: `underleaf-latex:latest`
- **Features**:
  - Full TeXLive installation
  - Claude CLI integration
  - Mounts shared repository volume
  - Automatic cleanup after idle time

#### Repository Volumes (Per Project)
- **Purpose**: Shared storage for repository files
- **Type**: Docker named volumes
- **Features**:
  - Persistent storage across container restarts
  - Shared between multiple user containers
  - Automatic initialization from Git repository
  - **Never automatically deleted to preserve uncommitted changes**

## 🔄 Container Lifecycle

### Creation
1. User accesses a repository for the first time
2. Backend creates/finds the repository volume
3. Repository volume is initialized with Git data if empty
4. User container is created and mounts the repository volume
5. Container joins the internal network

### Management
- Repository volumes are created per Git repository
- User containers are created per user-repository combination
- Multiple users can work on the same repository simultaneously
- Idle containers are cleaned up after 1 hour of inactivity
- **Repository volumes are persistent and never automatically deleted**
- Container status is tracked in memory
- Failed containers are automatically recreated

### Cleanup
- Container cleanup runs every 30 minutes
- **Volumes are preserved to maintain uncommitted changes**
- Manual container cleanup via API endpoints
- Manual volume cleanup available for administrative purposes
- Graceful shutdown with 10-second timeout

## 🌐 Network Architecture

### Networks
- **`underleaf_web`**: Main network for all services
- **External**: Only Traefik exposes ports to the host

### Traffic Flow
1. **External Request** → Traefik (Port 80/443)
2. **Frontend Routes** → Frontend Container (Port 5173)
3. **API Routes** → Backend Container (Port 3000)
4. **Container Operations** → User Containers (Internal)

### Routing Rules
```yaml
# Frontend
Host: localhost
Path: /*

# Backend API
Host: localhost
PathPrefix: /api/*

# User containers don't expose HTTP ports
```

## 🔧 Container Management

### API Endpoints

#### Get Container Stats
```http
GET /api/containers/stats
```
Returns overview of all user containers and repository volumes.

#### Get User Container Info
```http
GET /api/containers/:userId/:repoName
```
Returns specific container information.

#### Get Repository Collaboration Info
```http
GET /api/repositories/:repoName/containers
```
Returns all containers and users working on a repository.

#### Get Volume Information
```http
GET /api/volumes/:repoName
```
Returns repository volume information.

#### Remove User Container
```http
DELETE /api/containers/:userId/:repoName
```
Manually removes a user's container.

#### Force Remove Repository Volume (Admin Only)
```http
DELETE /api/volumes/:repoName/force
```
**⚠️ DANGER**: Permanently deletes repository volume and all uncommitted changes.
Requires confirmation: `{"confirm": "DELETE_ALL_DATA"}`

### Management Scripts

#### Setup Infrastructure
```bash
./scripts/setup-containers.sh
```
- Creates Docker networks
- Builds base images
- Starts infrastructure services

#### Monitor Containers
```bash
./scripts/monitor-containers.sh
```
- Shows container status
- Displays resource usage
- Lists management commands

## 🔒 Security & Isolation

### User & Project Isolation
- Each user gets a separate container per repository
- Repository files are shared via Docker volumes
- Multiple users can collaborate on the same repository
- Network isolation within Docker networks
- Resource limits (can be configured)

### Security Features
- No direct external access to user containers
- All communication through authenticated API
- Container labels for identification and management
- Repository access control via backend authentication
- Automatic cleanup prevents resource exhaustion
- File system isolation between different repositories

## 📊 Resource Management

### Container Limits
```yaml
# Default limits (can be customized)
memory: 512MB
cpu: 0.5 cores
disk: 1GB (via volume mounts)
```

### Cleanup Policies
- **Idle Timeout**: 1 hour
- **Cleanup Interval**: 30 minutes
- **Max Containers**: Unlimited (resource-dependent)

## 🚀 Deployment

### Development
```bash
# Start infrastructure
./scripts/setup-containers.sh

# Monitor status
./scripts/monitor-containers.sh
```

### Production Considerations
1. **SSL Configuration**: Configure Traefik with Let's Encrypt
2. **Resource Limits**: Set appropriate container limits
3. **Monitoring**: Add container monitoring and alerting
4. **Backup**: Implement repository backup strategies
5. **Scaling**: Consider container orchestration for high load

## 🔍 Troubleshooting

### Common Issues

#### Container Creation Fails
- Check Docker daemon is running
- Verify network exists: `docker network ls`
- Check image availability: `docker images`

#### Traefik Not Routing
- Verify labels on containers
- Check Traefik dashboard: http://localhost:8080
- Review Traefik logs: `docker-compose logs traefik`

#### User Container Issues
- Check container logs: `docker logs <container-name>`
- Verify volume mounts: `docker inspect <container-name>`
- Test container manually: `docker exec -it <container-name> bash`

### Debugging Commands
```bash
# View all containers
docker ps -a

# Check networks
docker network ls

# View container logs
docker-compose logs -f [service]

# Inspect container
docker inspect <container-name>

# Execute in container
docker exec -it <container-name> bash
```

## 📈 Monitoring & Metrics

### Available Metrics
- Container count and status
- Resource usage (CPU, memory, network)
- Creation and cleanup events
- API request patterns

### Monitoring Tools
- Traefik dashboard (http://localhost:8080)
- Docker stats commands
- Container management API endpoints
- Application logs

## 🔮 Future Enhancements

### Planned Features
1. **Container Scaling**: Automatic scaling based on load
2. **Resource Quotas**: Per-user resource limits
3. **Container Persistence**: Optional persistent containers
4. **Health Checks**: Advanced container health monitoring
5. **Metrics Export**: Prometheus/Grafana integration

### Optimization Opportunities
1. **Image Caching**: Shared base layers for faster startup
2. **Container Pooling**: Pre-warmed containers for instant access
3. **Resource Optimization**: Dynamic resource allocation
4. **Network Optimization**: Service mesh for advanced networking 