# AI Comments Tools for Underleaf

This document describes the new AI tools that allow Claude to interact with the comments system in Underleaf.

## Overview

The comments system now includes an MCP (Model Context Protocol) server that provides Claude AI with tools to read and write comments. This enables collaborative document review where AI can participate by:

- Reading existing comments
- Adding new comments to specific lines/sections
- Updating existing comments
- Organizing and filtering comments

## Available Tools

### 1. `list_comments`
Lists all comments in the repository, with optional filtering and sorting.

**Parameters:**
- `file_path` (optional): Filter comments by specific file path
- `sort_by` (optional): Sort by `created_date`, `file_name`, or `line_number` (default: `created_date`)
- `order` (optional): Sort order `asc` or `desc` (default: `asc`)

**Example usage:**
```
List all comments in the repository sorted by creation date
```

### 2. `read_comment`
Reads the full details of a specific comment.

**Parameters:**
- `comment_id` (required): The unique ID of the comment to read

**Example usage:**
```
Read the details of comment with ID "comment_1234567890_abc123"
```

### 3. `write_comment`
Creates a new comment on a specific file and location.

**Parameters:**
- `file_path` (required): Path to the file where the comment should be added
- `content` (required): The comment content/text
- `start_line` (required): Starting line number (1-based) where the comment applies
- `end_line` (optional): Ending line number (defaults to start_line)
- `start_column` (optional): Starting column number (default: 1)
- `end_column` (optional): Ending column number (default: end of line)
- `selected_text` (optional): The text that this comment refers to
- `author` (optional): Author of the comment (default: "Claude AI")

**Example usage:**
```
Add a comment to line 15 of main.tex suggesting an improvement to the introduction
```

### 4. `update_comment`
Updates the content of an existing comment.

**Parameters:**
- `comment_id` (required): The unique ID of the comment to update
- `content` (required): The new comment content

**Example usage:**
```
Update comment "comment_1234567890_abc123" with revised feedback
```

### 5. `delete_comment`
Deletes a comment by its ID.

**Parameters:**
- `comment_id` (required): The unique ID of the comment to delete

**Example usage:**
```
Delete comment "comment_1234567890_abc123" as it's no longer relevant
```

## Integration Details

### MCP Server
The comments functionality is implemented as an MCP server (`comments-server.js`) that:
- Runs in the LaTeX Docker container
- Stores comments in `/tmp/comments_{repoName}.json`
- Synchronizes with the frontend through API endpoints

### Frontend Synchronization
Comments are automatically synchronized between:
- Frontend localStorage (for UI display)
- Backend container filesystem (for AI access)
- Real-time updates in the editor

### Comment Data Structure
Each comment contains:
```typescript
{
  id: string;           // Unique identifier
  fileName: string;     // File path relative to repository root
  startLine: number;    // Starting line (1-based)
  startColumn: number;  // Starting column (1-based)
  endLine: number;      // Ending line (1-based)
  endColumn: number;    // Ending column (1-based)
  selectedText: string; // Text the comment refers to
  content: string;      // Comment content
  author: string;       // Comment author
  createdAt: Date;      // Creation timestamp
  updatedAt: Date;      // Last update timestamp
}
```

## Use Cases

### 1. Document Review
Claude can review LaTeX documents and add comments with suggestions:
```
Claude, please review this document and add comments with suggestions for improvement
```

### 2. Code Quality
AI can comment on LaTeX code quality and best practices:
```
Add comments pointing out any LaTeX best practices violations in this document
```

### 3. Collaborative Editing
Users and AI can leave comments for each other:
```
Read all comments from other users and add follow-up comments where appropriate
```

### 4. Documentation
AI can add explanatory comments to complex LaTeX sections:
```
Add explanatory comments to help understand the complex mathematical notation in section 3
```

## Example Workflow

1. **User loads a LaTeX document** → Comments are synchronized to the backend
2. **User asks Claude to review** → Claude uses `list_comments` to see existing feedback
3. **Claude analyzes the document** → Claude uses `write_comment` to add suggestions
4. **Comments appear in UI** → Comments are synchronized back to frontend and displayed
5. **User responds to AI comments** → New comments are synchronized for AI to see
6. **Iterative improvement** → Continuous collaboration between user and AI

## Configuration

The comments tools are automatically available when:
- The LaTeX container includes the MCP server
- Claude CLI is configured with MCP support
- The repository has a `.claude/settings.json` file with MCP configuration

The system handles all synchronization automatically, requiring no additional setup from users. 