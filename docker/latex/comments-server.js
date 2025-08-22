#!/usr/bin/env node

/**
 * Comments MCP Server for Underleaf
 * This server provides tools for AI to interact with the comments system
 */

const { Server } = require('/usr/lib/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/index.js');
const { StdioServerTransport } = require('/usr/lib/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('/usr/lib/node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js');
const fs = require('fs').promises;
const path = require('path');

class CommentsServer {
  constructor() {
    this.server = new Server(
      {
        name: 'underleaf-comments',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[Comments MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'show_all_comments',
            description: 'List all comments in the repository, optionally filtered by file',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: {
                  type: 'string',
                  description: 'Optional: Filter comments by specific file path. If not provided, returns all comments.',
                },
                sort_by: {
                  type: 'string',
                  enum: ['created_date', 'file_name', 'line_number'],
                  default: 'created_date',
                  description: 'Sort comments by specified criteria'
                },
                order: {
                  type: 'string',
                  enum: ['asc', 'desc'],
                  default: 'asc',
                  description: 'Sort order'
                }
              },
              required: []
            }
          },
          {
            name: 'view_comment_details',
            description: 'Read a specific comment by its ID',
            inputSchema: {
              type: 'object',
              properties: {
                comment_id: {
                  type: 'string',
                  description: 'The unique ID of the comment to read'
                }
              },
              required: ['comment_id']
            }
          },
          {
            name: 'add_comment',
            description: 'Create a new comment on a specific file and location',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: {
                  type: 'string',
                  description: 'Path to the file where the comment should be added'
                },
                content: {
                  type: 'string',
                  description: 'The comment content/text'
                },
                start_line: {
                  type: 'integer',
                  description: 'Starting line number (1-based) where the comment applies'
                },
                end_line: {
                  type: 'integer',
                  description: 'Ending line number (1-based) where the comment applies. If not provided, defaults to start_line'
                },
                start_column: {
                  type: 'integer',
                  default: 1,
                  description: 'Starting column number (1-based)'
                },
                end_column: {
                  type: 'integer',
                  description: 'Ending column number (1-based). If not provided, defaults to end of line'
                },
                selected_text: {
                  type: 'string',
                  default: '',
                  description: 'The text that this comment refers to (optional)'
                },
                author: {
                  type: 'string',
                  default: 'Claude',
                  description: 'Author of the comment'
                }
              },
              required: ['file_path', 'content', 'start_line', 'end_line', 'start_column', 'end_column']
            }
          },
          {
            name: 'edit_comment',
            description: 'Update an existing comment content',
            inputSchema: {
              type: 'object',
              properties: {
                comment_id: {
                  type: 'string',
                  description: 'The unique ID of the comment to update'
                },
                content: {
                  type: 'string',
                  description: 'New content for the comment'
                }
              },
              required: ['comment_id', 'content']
            }
          },
          {
            name: 'remove_comment',
            description: 'Delete a comment by its ID',
            inputSchema: {
              type: 'object',
              properties: {
                comment_id: {
                  type: 'string',
                  description: 'The unique ID of the comment to delete'
                }
              },
              required: ['comment_id']
            }
          },
          {
            name: 'update_comment_positions',
            description: 'Update comment positions when text changes occur in a file',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: {
                  type: 'string',
                  description: 'Path to the file where text changes occurred'
                },
                changes: {
                  type: 'array',
                  description: 'Array of text changes that occurred',
                  items: {
                    type: 'object',
                    properties: {
                      start_line: {
                        type: 'integer',
                        description: 'Starting line number where change began (1-based)'
                      },
                      start_column: {
                        type: 'integer',
                        description: 'Starting column number where change began (1-based)'
                      },
                      end_line: {
                        type: 'integer',
                        description: 'Ending line number where change ended (1-based)'
                      },
                      end_column: {
                        type: 'integer',
                        description: 'Ending column number where change ended (1-based)'
                      },
                      lines_added: {
                        type: 'integer',
                        description: 'Number of lines added (positive) or removed (negative)'
                      },
                      lines_content: {
                        type: 'array',
                        description: 'Content of the new lines (for additions)',
                        items: {
                          type: 'string'
                        }
                      }
                    },
                    required: ['start_line', 'start_column', 'end_line', 'end_column', 'lines_added']
                  }
                }
              },
              required: ['file_path', 'changes']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'show_all_comments':
            return await this.listComments(args);
          case 'view_comment_details':
            return await this.readComment(args);
          case 'add_comment':
            return await this.writeComment(args);
          case 'edit_comment':
            return await this.updateComment(args);
          case 'remove_comment':
            return await this.deleteComment(args);
          case 'update_comment_positions':
            return await this.updateCommentPositions(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async getCommentsData() {
    try {
      // Get the repository name from the current working directory
      const cwd = process.cwd();
      const repoName = path.basename(cwd);
      
      // Use persistent storage in .underleaf directory instead of /tmp
      const commentsFile = path.join(cwd, '.underleaf', 'comments.json');
      
      try {
        const data = await fs.readFile(commentsFile, 'utf8');
        const comments = JSON.parse(data);
        return Array.isArray(comments) ? comments : [];
      } catch (fileError) {
        // If file doesn't exist, return empty array
        if (fileError.code === 'ENOENT') {
          return [];
        }
        throw fileError;
      }
    } catch (error) {
      console.error('Error reading comments data:', error);
      return [];
    }
  }

  async saveCommentsData(comments) {
    try {
      const cwd = process.cwd();
      const underleafDir = path.join(cwd, '.underleaf');
      const commentsFile = path.join(underleafDir, 'comments.json');
      
      // Ensure .underleaf directory exists
      try {
        await fs.mkdir(underleafDir, { recursive: true });
      } catch (mkdirError) {
        // Directory might already exist, ignore the error
        if (mkdirError.code !== 'EEXIST') {
          throw mkdirError;
        }
      }
      
      await fs.writeFile(commentsFile, JSON.stringify(comments, null, 2));
      console.log(`Comments saved to persistent storage: ${commentsFile}`);
      return true;
    } catch (error) {
      console.error('Error saving comments data:', error);
      return false;
    }
  }

  async listComments(args) {
    const comments = await this.getCommentsData();
    
    let filteredComments = comments;
    
    // Filter by file if specified
    if (args.file_path) {
      filteredComments = comments.filter(c => c.fileName === args.file_path);
    }
    
    // Sort comments
    const sortBy = args.sort_by || 'created_date';
    const order = args.order || 'asc';
    
    filteredComments.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'created_date':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        case 'file_name':
          aVal = a.fileName;
          bVal = b.fileName;
          break;
        case 'line_number':
          aVal = a.startLine;
          bVal = b.startLine;
          break;
        default:
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
      }
      
      if (order === 'desc') {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      } else {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      }
    });
    
    const summary = args.file_path 
      ? `Found ${filteredComments.length} comments in ${args.file_path}`
      : `Found ${filteredComments.length} total comments across all files`;
    
    let result = `${summary}\n\n`;
    
    if (filteredComments.length === 0) {
      result += 'No comments found.';
    } else {
      result += filteredComments.map(comment => {
        const date = new Date(comment.createdAt).toLocaleString();
        const location = `${comment.fileName}:${comment.startLine}`;
        const preview = comment.content.length > 100 
          ? comment.content.substring(0, 100) + '...'
          : comment.content;
        
        return `ID: ${comment.id}
Location: ${location}
Author: ${comment.author}
Created: ${date}
Content: ${preview}
${comment.selectedText ? `Selected Text: "${comment.selectedText}"` : ''}
---`;
      }).join('\n\n');
    }
    
    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    };
  }

  async readComment(args) {
    const comments = await this.getCommentsData();
    const comment = comments.find(c => c.id === args.comment_id);
    
    if (!comment) {
      return {
        content: [
          {
            type: 'text',
            text: `Comment with ID ${args.comment_id} not found.`
          }
        ],
        isError: true
      };
    }
    
    const date = new Date(comment.createdAt).toLocaleString();
    const updatedDate = new Date(comment.updatedAt).toLocaleString();
    const location = `${comment.fileName}:${comment.startLine}-${comment.endLine}`;
    
    const result = `Comment Details:
ID: ${comment.id}
Location: ${location}
Author: ${comment.author}
Created: ${date}
Updated: ${updatedDate}
${comment.selectedText ? `Selected Text: "${comment.selectedText}"` : ''}

Content:
${comment.content}`;
    
    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    };
  }

  async writeComment(args) {
    const comments = await this.getCommentsData();
    
    // Generate a unique ID
    const id = 'comment_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Create new comment object
    const newComment = {
      id: id,
      fileName: args.file_path,
      startLine: args.start_line,
      startColumn: args.start_column || 1,
      endLine: args.end_line || args.start_line,
      endColumn: args.end_column || 999, // Default to end of line
      selectedText: args.selected_text || '',
      content: args.content,
      author: args.author || 'Claude AI',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Add to comments array
    comments.push(newComment);
    
    // Save to file
    const saved = await this.saveCommentsData(comments);
    
    if (!saved) {
      return {
        content: [
          {
            type: 'text',
            text: 'Failed to save comment to storage.'
          }
        ],
        isError: true
      };
    }
    
    const result = `Comment created successfully!
ID: ${newComment.id}
Location: ${newComment.fileName}:${newComment.startLine}
Author: ${newComment.author}
Content: ${newComment.content}`;
    
    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    };
  }

  async updateComment(args) {
    const comments = await this.getCommentsData();
    const commentIndex = comments.findIndex(c => c.id === args.comment_id);
    
    if (commentIndex === -1) {
      return {
        content: [
          {
            type: 'text',
            text: `Comment with ID ${args.comment_id} not found.`
          }
        ],
        isError: true
      };
    }
    
    // Update the comment
    comments[commentIndex].content = args.content;
    comments[commentIndex].updatedAt = new Date().toISOString();
    
    // Save to file
    const saved = await this.saveCommentsData(comments);
    
    if (!saved) {
      return {
        content: [
          {
            type: 'text',
            text: 'Failed to save updated comment to storage.'
          }
        ],
        isError: true
      };
    }
    
    const result = `Comment updated successfully!
ID: ${args.comment_id}
New Content: ${args.content}
Updated: ${comments[commentIndex].updatedAt}`;
    
    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    };
  }

  async deleteComment(args) {
    const comments = await this.getCommentsData();
    const commentIndex = comments.findIndex(c => c.id === args.comment_id);
    
    if (commentIndex === -1) {
      return {
        content: [
          {
            type: 'text',
            text: `Comment with ID ${args.comment_id} not found.`
          }
        ],
        isError: true
      };
    }
    
    const deletedComment = comments[commentIndex];
    
    // Remove the comment
    comments.splice(commentIndex, 1);
    
    // Save to file
    const saved = await this.saveCommentsData(comments);
    
    if (!saved) {
      return {
        content: [
          {
            type: 'text',
            text: 'Failed to save changes after comment deletion.'
          }
        ],
        isError: true
      };
    }
    
    const result = `Comment deleted successfully!
ID: ${args.comment_id}
Location: ${deletedComment.fileName}:${deletedComment.startLine}
Author: ${deletedComment.author}
Content: ${deletedComment.content}`;
    
    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    };
  }

  async updateCommentPositions(args) {
    const comments = await this.getCommentsData();
    const { file_path, changes } = args;
    
    // Find all comments for the specified file
    const fileComments = comments.filter(c => c.fileName === file_path);
    
    if (fileComments.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No comments found for file: ${file_path}`
          }
        ]
      };
    }
    
    // Sort changes by line number (reverse order to process from bottom to top)
    // This ensures that line number adjustments don't affect subsequent changes
    const sortedChanges = changes.sort((a, b) => b.start_line - a.start_line);
    
    let updatedCount = 0;
    
    // Process each comment
    for (const comment of fileComments) {
      let newStartLine = comment.startLine;
      let newStartColumn = comment.startColumn;
      let newEndLine = comment.endLine;
      let newEndColumn = comment.endColumn;
      let positionChanged = false;
      
      // Apply each change to this comment's position
      for (const change of sortedChanges) {
        const { start_line, start_column, end_line, end_column, lines_added } = change;
        
        // Check if comment is affected by this change
        const isCommentAfterChange = comment.startLine > end_line || 
          (comment.startLine === end_line && comment.startColumn >= end_column);
        
        const isCommentOverlappingChange = (
          (comment.startLine >= start_line && comment.startLine <= end_line) ||
          (comment.endLine >= start_line && comment.endLine <= end_line) ||
          (comment.startLine < start_line && comment.endLine > end_line)
        );
        
        if (isCommentAfterChange) {
          // Comment is completely after the change - adjust line numbers
          if (lines_added !== 0) {
            newStartLine += lines_added;
            newEndLine += lines_added;
            positionChanged = true;
          }
        } else if (isCommentOverlappingChange) {
          // Comment overlaps with the change area
          if (comment.startLine >= start_line && comment.startLine <= end_line) {
            // Comment starts within the changed area
            if (lines_added > 0) {
              // Text was added - move comment after the addition
              newStartLine = start_line + lines_added;
              newStartColumn = 1; // Reset to beginning of line
              
              // Adjust end position relative to new start
              const originalSpan = comment.endLine - comment.startLine;
              newEndLine = newStartLine + originalSpan;
              if (originalSpan === 0) {
                newEndColumn = comment.endColumn;
              }
              positionChanged = true;
            } else if (lines_added < 0) {
              // Text was removed - check if comment should be moved
              const removedLines = Math.abs(lines_added);
              if (comment.startLine > start_line + removedLines) {
                // Comment was after the removed section
                newStartLine = comment.startLine + lines_added;
                newEndLine = comment.endLine + lines_added;
                positionChanged = true;
              } else {
                // Comment was within or partially within removed section
                // Move it to just after the change point
                newStartLine = start_line;
                newStartColumn = start_column;
                newEndLine = start_line;
                newEndColumn = start_column + (comment.selectedText?.length || 0);
                positionChanged = true;
              }
            }
          }
        }
        
        // Handle column adjustments for same-line changes
        if (comment.startLine === start_line && comment.startLine === end_line) {
          if (comment.startColumn >= end_column) {
            // Comment is after the change on the same line
            const charactersChanged = (change.lines_content?.[0]?.length || 0) - (end_column - start_column);
            newStartColumn += charactersChanged;
            newEndColumn += charactersChanged;
            positionChanged = true;
          } else if (comment.startColumn >= start_column && comment.startColumn < end_column) {
            // Comment starts within the changed text on the same line
            newStartColumn = start_column;
            if (change.lines_content?.[0]) {
              newEndColumn = start_column + change.lines_content[0].length;
            }
            positionChanged = true;
          }
        }
      }
      
      // Update the comment if position changed
      if (positionChanged) {
        const commentIndex = comments.findIndex(c => c.id === comment.id);
        if (commentIndex !== -1) {
          comments[commentIndex].startLine = Math.max(1, newStartLine);
          comments[commentIndex].startColumn = Math.max(1, newStartColumn);
          comments[commentIndex].endLine = Math.max(1, newEndLine);
          comments[commentIndex].endColumn = Math.max(1, newEndColumn);
          comments[commentIndex].updatedAt = new Date().toISOString();
          updatedCount++;
        }
      }
    }
    
    // Save the updated comments
    const saved = await this.saveCommentsData(comments);
    
    if (!saved) {
      return {
        content: [
          {
            type: 'text',
            text: 'Failed to save updated comment positions.'
          }
        ],
        isError: true
      };
    }
    
    const result = `Comment positions updated successfully!
File: ${file_path}
Changes processed: ${changes.length}
Comments updated: ${updatedCount} out of ${fileComments.length}
Comments for this file: ${fileComments.length}`;
    
    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Comments MCP Server running on stdio');
  }

  async runOneShot(jsonInput) {
    try {
      const request = JSON.parse(jsonInput);
      if (request.method === 'tools/call') {
        const { name, arguments: args } = request.params;
        
        switch (name) {
          case 'show_all_comments':
            return await this.listComments(args);
          case 'view_comment_details':
            return await this.readComment(args);
          case 'add_comment':
            return await this.writeComment(args);
          case 'edit_comment':
            return await this.updateComment(args);
          case 'remove_comment':
            return await this.deleteComment(args);
          case 'update_comment_positions':
            return await this.updateCommentPositions(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } else {
        throw new Error(`Unsupported method: ${request.method}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
}

const server = new CommentsServer();

// Check if we're running in one-shot mode (stdin input provided)
if (process.stdin.isTTY === false) {
  // Read from stdin for one-shot execution
  let stdinInput = '';
  process.stdin.on('data', (chunk) => {
    stdinInput += chunk;
  });
  
  process.stdin.on('end', async () => {
    try {
      const result = await server.runOneShot(stdinInput.trim());
      console.log(JSON.stringify(result));
      process.exit(0);
    } catch (error) {
      console.error(JSON.stringify({
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      }));
      process.exit(1);
    }
  });
} else {
  // Run as persistent MCP server
  server.run().catch(console.error);
} 