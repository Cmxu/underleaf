# Model Context Protocol (MCP) Integration Guide

## Overview

The Model Context Protocol (MCP) is an open-source standard that enables AI assistants like Claude to securely connect to data sources and tools through a standardized protocol. This guide details how to integrate MCP servers with the Underleaf LaTeX editor project.

## What is MCP?

MCP enables AI assistants to interact with external systems by defining:
- **Tools**: Functions that the AI can call to perform actions
- **Resources**: Data sources that the AI can access
- **Prompts**: Reusable prompt templates

## Architecture Overview

### MCP in Underleaf Context

Our current architecture:
- **Frontend**: SvelteKit with TypeScript
- **Backend**: Node.js/Express with TypeScript
- **Infrastructure**: Docker containers for LaTeX compilation

MCP servers can be integrated to:
1. Provide LaTeX-specific tools and resources
2. Connect to external APIs (Git, file systems, databases)
3. Enable AI-powered LaTeX assistance

## MCP Server Types

### 1. Node.js/TypeScript MCP Servers

**Advantages for Underleaf:**
- Matches our existing backend technology stack
- Easy integration with our Express.js backend
- Shared TypeScript types and utilities

**Setup:**
```bash
# Install MCP SDK
npm install @anthropic-ai/claude-code

# For server development
npm install @modelcontextprotocol/sdk
```

**Basic Server Structure:**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

class UnderleafMCPServer {
  private server: Server;
  
  constructor() {
    this.server = new Server({
      name: 'underleaf-mcp-server',
      version: '1.0.0',
    }, {
      capabilities: {
        tools: {},
        resources: {},
      },
    });
    
    this.setupToolHandlers();
  }
  
  private setupToolHandlers() {
    // Tool definitions here
  }
  
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

## Integration with Underleaf

### Recommended MCP Servers for Underleaf

#### 1. LaTeX Compilation Server

**Purpose:** Provide LaTeX compilation tools and document processing

**Tools:**
- `compile_latex`: Compile LaTeX source to PDF
- `validate_syntax`: Check LaTeX syntax
- `get_packages`: List available LaTeX packages
- `optimize_document`: Suggest LaTeX optimizations

**Resources:**
- `templates`: Access LaTeX document templates
- `package_docs`: LaTeX package documentation

#### 2. Git Integration Server

**Purpose:** Enhanced Git operations for project management

**Tools:**
- `clone_repository`: Clone Git repositories
- `commit_changes`: Commit file changes
- `create_branch`: Create new Git branches
- `merge_changes`: Merge branches

**Resources:**
- `repository_info`: Repository metadata
- `commit_history`: Git commit history

#### 3. File System Server

**Purpose:** Advanced file operations within projects

**Tools:**
- `create_file`: Create new files
- `rename_file`: Rename files/directories
- `search_content`: Search within files
- `backup_project`: Create project backups

**Resources:**
- `file_tree`: Project file structure
- `file_content`: Individual file contents

### Implementation in Current Architecture

#### Backend Integration

Add MCP server management to the Express.js backend:

```typescript
// backend/src/services/mcpService.ts
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export class MCPServerManager extends EventEmitter {
  private servers: Map<string, any> = new Map();
  
  async startServer(serverName: string, serverPath: string) {
    const serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    this.servers.set(serverName, serverProcess);
    
    // Handle server communication
    serverProcess.on('message', (message) => {
      this.emit('server-message', serverName, message);
    });
  }
  
  async callTool(serverName: string, toolName: string, args: any) {
    const server = this.servers.get(serverName);
    if (!server) throw new Error(`Server ${serverName} not found`);
    
    // Implement MCP protocol communication
  }
}
```

#### Frontend Integration

Add MCP tool interfaces to the SvelteKit frontend:

```typescript
// frontend/src/lib/mcp/mcpClient.ts
export class MCPClient {
  private baseUrl: string;
  
  constructor(baseUrl: string = '/api/mcp') {
    this.baseUrl = baseUrl;
  }
  
  async callTool(serverName: string, toolName: string, args: any) {
    const response = await fetch(`${this.baseUrl}/tools/${serverName}/${toolName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    
    return response.json();
  }
  
  async getResources(serverName: string, resourceType: string) {
    const response = await fetch(`${this.baseUrl}/resources/${serverName}/${resourceType}`);
    return response.json();
  }
}
```

### Docker Integration

Add MCP servers to the docker-compose.yml:

```yaml
services:
  # ... existing services ...
  
  mcp-latex-server:
    build:
      context: ./mcp-servers/latex
      dockerfile: Dockerfile
    container_name: underleaf-mcp-latex
    restart: unless-stopped
    networks:
      - internal
    volumes:
      - ./repos:/workdir
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - NODE_ENV=production
      - LATEX_IMAGE=underleaf-latex:latest
  
  mcp-git-server:
    build:
      context: ./mcp-servers/git
      dockerfile: Dockerfile
    container_name: underleaf-mcp-git
    restart: unless-stopped
    networks:
      - internal
    volumes:
      - ./repos:/repositories
    environment:
      - NODE_ENV=production
```

## Configuration

### MCP Server Configuration

Create a configuration file for MCP servers:

```json
{
  "mcpServers": {
    "latex": {
      "command": "node",
      "args": ["./mcp-servers/latex/dist/index.js"],
      "env": {
        "LATEX_IMAGE": "underleaf-latex:latest"
      }
    },
    "git": {
      "command": "node", 
      "args": ["./mcp-servers/git/dist/index.js"],
      "env": {
        "REPO_BASE_PATH": "/repositories"
      }
    },
    "filesystem": {
      "command": "python",
      "args": ["./mcp-servers/filesystem/server.py"],
      "env": {
        "WORKDIR": "/workdir"
      }
    }
  }
}
```

### Environment Variables

```bash
# MCP Configuration
MCP_CONFIG_PATH=/path/to/mcp-config.json
MCP_LOG_LEVEL=info

# LaTeX MCP Server
LATEX_DOCKER_IMAGE=underleaf-latex:latest
LATEX_COMPILE_TIMEOUT=30000

# Git MCP Server  
GIT_REPO_BASE_PATH=/app/repos
GIT_DEFAULT_BRANCH=main

# Filesystem MCP Server
FS_ALLOWED_EXTENSIONS=.tex,.bib,.cls,.sty,.pdf
FS_MAX_FILE_SIZE=10MB
```

## Security Considerations

### Authentication & Authorization

1. **API Key Management**: Use environment variables for sensitive credentials
2. **Permission Scoping**: Limit MCP server access to specific directories/operations
3. **Input Validation**: Validate all tool inputs to prevent injection attacks
4. **Container Isolation**: Run MCP servers in isolated containers

### Access Control

```typescript
// backend/src/middleware/mcpAuth.ts
export const mcpAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const { serverName, toolName } = req.params;
  const userId = req.user?.id;
  
  // Check if user has permission to access this MCP tool
  if (!hasPermission(userId, serverName, toolName)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  
  next();
};

function hasPermission(userId: string, serverName: string, toolName: string): boolean {
  // Implement permission logic
  const permissions = getUserPermissions(userId);
  return permissions.includes(`${serverName}:${toolName}`);
}
```

## Development Workflow

### 1. Create MCP Server

```bash
# Create new MCP server directory
mkdir mcp-servers/latex
cd mcp-servers/latex

# Initialize Node.js project
npm init -y
npm install @modelcontextprotocol/sdk

# Or for Python
mkdir mcp-servers/python-tools
cd mcp-servers/python-tools
pip install fastmcp
```

### 2. Implement Tools

```typescript
// mcp-servers/latex/src/index.ts
@mcp.tool()
async function compileLatex(source: string, options: CompileOptions): Promise<CompileResult> {
  try {
    // Use existing Docker infrastructure
    const result = await dockerCompile(source, options);
    return {
      success: true,
      pdf: result.pdf,
      logs: result.logs
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      logs: error.logs
    };
  }
}
```

### 3. Test MCP Server

```bash
# Test with MCP Inspector
npx @modelcontextprotocol/inspector mcp-servers/latex/dist/index.js

# Test with curl
curl -X POST http://localhost:3000/api/mcp/tools/latex/compile \
  -H "Content-Type: application/json" \
  -d '{"source": "\\documentclass{article}\\begin{document}Hello World\\end{document}"}'
```

### 4. Deploy with Docker

```dockerfile
# mcp-servers/latex/Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

CMD ["node", "dist/index.js"]
```

## Claude Desktop Integration

To use MCP servers with Claude Desktop, configure the client:

```json
{
  "mcpServers": {
    "underleaf-latex": {
      "command": "node",
      "args": ["/path/to/underleaf/mcp-servers/latex/dist/index.js"],
      "disabled": false
    },
    "underleaf-git": {
      "command": "node",
      "args": ["/path/to/underleaf/mcp-servers/git/dist/index.js"],
      "disabled": false
    }
  }
}
```

## Performance Optimization

### Caching

```typescript
// Implement caching for expensive operations
const cache = new Map<string, any>();

@mcp.tool()
async function getCachedCompilation(source: string): Promise<any> {
  const cacheKey = hashSource(source);
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  const result = await compileLatex(source);
  cache.set(cacheKey, result);
  
  return result;
}
```

### Connection Pooling

```typescript
// Pool MCP server connections
class MCPConnectionPool {
  private connections: Map<string, Connection[]> = new Map();
  
  async getConnection(serverName: string): Promise<Connection> {
    // Implement connection pooling logic
  }
  
  releaseConnection(serverName: string, connection: Connection) {
    // Return connection to pool
  }
}
```

## Monitoring & Logging

### Structured Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'mcp-server.log' }),
    new winston.transports.Console()
  ]
});

// Log MCP tool calls
logger.info('MCP tool called', {
  serverName: 'latex',
  toolName: 'compile',
  userId: req.user.id,
  duration: Date.now() - startTime
});
```

### Health Checks

```typescript
@mcp.tool()
async function healthCheck(): Promise<{ status: string; timestamp: number }> {
  return {
    status: 'healthy',
    timestamp: Date.now()
  };
}
```

## References

- [Anthropic Claude Code SDK Documentation](https://docs.anthropic.com/en/docs/claude-code/sdk#mcp-configuration)
- [How to Build an MCP Server Fast: A Step-by-Step Tutorial](https://medium.com/@eugenesh4work/how-to-build-an-mcp-server-fast-a-step-by-step-tutorial-e09faa5f7e3b)
- [FastMCP: The Fast Way to Build MCP Servers](https://medium.com/@shmilysyg/fastmcp-the-fastway-to-build-mcp-servers-aa14f88536d2)
- [Model Context Protocol Specification](https://github.com/modelcontextprotocol/specification)

## Next Steps

1. **Choose MCP Implementation**: Decide between Node.js/TypeScript or Python/FastMCP based on team expertise
2. **Implement Core Tools**: Start with LaTeX compilation and Git integration servers
3. **Security Audit**: Review authentication and authorization mechanisms
4. **Performance Testing**: Test MCP servers under load
5. **Documentation**: Create detailed API documentation for custom MCP tools
6. **Monitoring Setup**: Implement comprehensive logging and monitoring 