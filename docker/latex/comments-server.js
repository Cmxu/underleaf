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
            name: 'list_comments',
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
            name: 'read_comment',
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
            name: 'write_comment',
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
            name: 'update_comment',
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
                  description: 'The new comment content'
                }
              },
              required: ['comment_id', 'content']
            }
          },
          {
            name: 'delete_comment',
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
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'list_comments':
            return await this.listComments(args);
          case 'read_comment':
            return await this.readComment(args);
          case 'write_comment':
            return await this.writeComment(args);
          case 'update_comment':
            return await this.updateComment(args);
          case 'delete_comment':
            return await this.deleteComment(args);
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Comments MCP Server running on stdio');
  }
}

const server = new CommentsServer();
server.run().catch(console.error); 