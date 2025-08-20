#!/usr/bin/env node

/**
 * Test script for the Comments MCP Server
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function testCommentsServer() {
  console.log('🧪 Testing Comments MCP Server...\n');

  // Start the comments server
  const serverPath = path.join(__dirname, '..', 'docker', 'latex', 'comments-server.js');
  
  if (!fs.existsSync(serverPath)) {
    console.error('❌ Comments server not found at:', serverPath);
    process.exit(1);
  }

  const server = spawn('node', [serverPath], {
    stdio: 'pipe'
  });

  let serverOutput = '';
  let hasStarted = false;

  server.stderr.on('data', (data) => {
    const output = data.toString();
    console.log('📡 Server:', output.trim());
    if (output.includes('running on stdio')) {
      hasStarted = true;
      runTests();
    }
  });

  server.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });

  // Test functions
  function sendMessage(message) {
    return new Promise((resolve) => {
      server.stdin.write(JSON.stringify(message) + '\n');
      
      // Simple response parsing (for testing purposes)
      setTimeout(() => {
        resolve(serverOutput);
        serverOutput = '';
      }, 100);
    });
  }

  async function runTests() {
    console.log('\n🚀 Running MCP Server Tests...\n');

    try {
      // Test 1: List Tools
      console.log('1️⃣ Testing list_tools...');
      const listToolsRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      };
      
      await sendMessage(listToolsRequest);
      console.log('✅ List tools request sent\n');

      // Test 2: Write a comment
      console.log('2️⃣ Testing write_comment...');
      const writeCommentRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'write_comment',
          arguments: {
            file_path: 'test.tex',
            content: 'This is a test comment from the MCP server',
            start_line: 5,
            end_line: 5,
            start_column: 1,
            end_column: 20,
            selected_text: '\\section{Introduction}',
            author: 'MCP Test Bot'
          }
        }
      };
      
      await sendMessage(writeCommentRequest);
      console.log('✅ Write comment request sent\n');

      // Test 3: List comments
      console.log('3️⃣ Testing list_comments...');
      const listCommentsRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'list_comments',
          arguments: {}
        }
      };
      
      await sendMessage(listCommentsRequest);
      console.log('✅ List comments request sent\n');

      // Wait a bit for all responses
      setTimeout(() => {
        console.log('🎉 All tests completed! Check the server output above for responses.\n');
        console.log('📝 Note: This is a basic connectivity test. Full integration testing');
        console.log('   should be done with the actual Claude CLI and MCP framework.\n');
        
        server.kill('SIGTERM');
        process.exit(0);
      }, 500);

    } catch (error) {
      console.error('❌ Test failed:', error);
      server.kill('SIGTERM');
      process.exit(1);
    }
  }

  // Handle server errors
  server.on('error', (error) => {
    console.error('❌ Server error:', error);
    process.exit(1);
  });

  server.on('close', (code) => {
    console.log(`📡 Server closed with code ${code}`);
  });

  // Timeout for server startup
  setTimeout(() => {
    if (!hasStarted) {
      console.error('❌ Server failed to start within 5 seconds');
      server.kill('SIGTERM');
      process.exit(1);
    }
  }, 5000);
}

testCommentsServer().catch(console.error); 