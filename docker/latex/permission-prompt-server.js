#!/usr/bin/env node

/**
 * Custom MCP Server for Permission Prompts
 * This server provides tools to handle permission prompts in the Underleaf AI chat
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('fs').promises;
const path = require('path');

class PermissionPromptServer {
  constructor() {
    this.server = new Server(
      {
        name: 'underleaf-permission-prompt',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'permission_prompt',
            description: 'Create a permission prompt in the AI chat panel for user approval',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'The permission message to display to the user',
                },
                action: {
                  type: 'string',
                  description: 'The action that requires permission (e.g., "edit_file", "run_command")',
                },
                details: {
                  type: 'object',
                  description: 'Additional details about the action',
                  properties: {
                    file_path: { type: 'string' },
                    command: { type: 'string' },
                    changes: { type: 'string' },
                  },
                },
                severity: {
                  type: 'string',
                  enum: ['low', 'medium', 'high'],
                  description: 'The severity level of the action',
                  default: 'medium',
                },
              },
              required: ['message', 'action'],
            },
          },
          {
            name: 'wait_for_permission',
            description: 'Wait for user permission response',
            inputSchema: {
              type: 'object',
              properties: {
                prompt_id: {
                  type: 'string',
                  description: 'The ID of the permission prompt to wait for',
                },
                timeout_seconds: {
                  type: 'number',
                  description: 'Maximum time to wait for response in seconds',
                  default: 300,
                },
              },
              required: ['prompt_id'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'permission_prompt':
          return await this.handlePermissionPrompt(request.params.arguments);
        case 'wait_for_permission':
          return await this.handleWaitForPermission(request.params.arguments);
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  async handlePermissionPrompt(args) {
    const { message, action, details = {}, severity = 'medium' } = args;
    
    // Generate unique prompt ID
    const promptId = `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create permission prompt data
    const promptData = {
      id: promptId,
      message,
      action,
      details,
      severity,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    // Write prompt to communication file that the backend can read
    const commDir = '/tmp/claude-comm';
    const promptFile = path.join(commDir, `permission_${promptId}.json`);
    
    try {
      // Ensure communication directory exists
      await fs.mkdir(commDir, { recursive: true });
      
      // Write prompt data
      await fs.writeFile(promptFile, JSON.stringify(promptData, null, 2));
      
      // Create a trigger file to notify the backend
      const triggerFile = path.join(commDir, 'permission_trigger');
      await fs.writeFile(triggerFile, promptId);

      return {
        content: [
          {
            type: 'text',
            text: `Permission prompt created with ID: ${promptId}\n\nMessage: ${message}\nAction: ${action}\nSeverity: ${severity}\n\nWaiting for user response...`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error creating permission prompt: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  async handleWaitForPermission(args) {
    const { prompt_id, timeout_seconds = 300 } = args;
    
    const commDir = '/tmp/claude-comm';
    const responseFile = path.join(commDir, `response_${prompt_id}.json`);
    
    const startTime = Date.now();
    const timeoutMs = timeout_seconds * 1000;
    
    // Poll for response file
    while (Date.now() - startTime < timeoutMs) {
      try {
        const responseData = await fs.readFile(responseFile, 'utf8');
        const response = JSON.parse(responseData);
        
        // Clean up response file
        await fs.unlink(responseFile).catch(() => {});
        
        return {
          content: [
            {
              type: 'text',
              text: `Permission response received: ${response.approved ? 'APPROVED' : 'DENIED'}\n\nReason: ${response.reason || 'No reason provided'}`,
            },
          ],
        };
      } catch (error) {
        // File doesn't exist yet, continue polling
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      }
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `Permission request timed out after ${timeout_seconds} seconds. No response received from user.`,
        },
      ],
      isError: true,
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Underleaf Permission Prompt MCP server running on stdio');
  }
}

// Run the server
if (require.main === module) {
  const server = new PermissionPromptServer();
  server.run().catch(console.error);
}

module.exports = PermissionPromptServer; 