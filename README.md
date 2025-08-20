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


Can you add the ability for suggested edits for comments? The following changes should be made.

1. In the comment bar add a small icon button to suggest an edit for the given comment.
2. When suggesting an edit, the editor should go into 'diff' mode where deleting text should cause it to be highlighted in red and added text highlighted in green. 
3. When editing a suggestion, the top bar of the editor should change to say 'Commenting: ' rather than 'Editing: ' and instead of the auto-save enabled writing there should be three buttons: reject, accept, and save. Reject should throw out the suggestion. Accept should make the changes of the suggestion. Save should save the diff then return the editor to editing. 
4. If a suggestion exists for a comment, there should be a button that lets you review the current suggestion. 
5. Diffs should be robust, i.e. if more text gets added or removed from the document the diff should still refer to the same locations
6. When creating a comment the user should be given an option to make a suggestion but can also submit a comment without suggestion
7. Modify the MCP servers so that AI can add a suggestion to the comment, make sure that the class can robustly handle the new diff structure and allow the AI to interact with it, also add a new MCP function that lets the AI directly add a suggestion to a comment.