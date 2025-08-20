# Underleaf

A collaborative LaTeX editor inspired by Overleaf, built with modern web technologies.

## Features

- **Real-time LaTeX editing** with Monaco Editor
- **PDF preview** with automatic compilation
- **Git integration** for version control
- **File tree navigation** with project management
- **AI-powered assistance** with Claude integration
- **Comments system** with AI collaboration support
- **Collaborative editing** through shared repositories
- **Docker-based isolation** for secure compilation

### 🤖 AI Comments Tools

Underleaf now includes advanced AI collaboration through comments:

- **AI Document Review**: Claude can read your LaTeX documents and provide feedback through comments
- **Interactive Comments**: AI can read existing comments and respond with suggestions
- **Code Quality Assistance**: AI can identify LaTeX best practices and add explanatory comments
- **Collaborative Workflow**: Seamless interaction between human reviewers and AI assistance

The AI has access to five comment tools:
- `list_comments` - Browse all comments with filtering and sorting
- `read_comment` - Get full details of specific comments
- `write_comment` - Add new comments to specific lines/sections
- `update_comment` - Modify existing comment content
- `delete_comment` - Remove outdated comments

Comments are automatically synchronized between the UI and AI, enabling real-time collaborative document review.

## Quick Start

1. Clone the repository
2. Run the development setup: `./scripts/dev.sh`
3. Open your browser to `http://localhost:5173`
4. Start editing LaTeX documents with AI-powered comments!

## Technology Stack

- **Frontend**: SvelteKit, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, Docker
- **Editor**: Monaco Editor with LaTeX syntax highlighting
- **PDF Viewer**: PDF.js for client-side rendering
- **AI Integration**: Claude CLI with MCP (Model Context Protocol)
- **Containerization**: Docker for isolated LaTeX compilation

## Documentation

- [Comments AI Tools Guide](COMMENTS_AI_TOOLS.md) - Detailed guide for AI comment features
- [Container Architecture](CONTAINER_ARCHITECTURE.md) - Docker setup and architecture
- [MCP Integration](MCP.md) - Model Context Protocol implementation

## Development

See the individual README files in the `frontend/` and `backend/` directories for development setup instructions.

## License

MIT License - see LICENSE file for details. 