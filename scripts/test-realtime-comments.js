#!/usr/bin/env node

/**
 * Test script for real-time AI comment synchronization
 * This script simulates AI adding comments via the MCP server and checks if they appear in the frontend
 */

const fs = require('fs').promises;
const path = require('path');

// Configuration
const REPO_NAME = 'underleaf';
const COMMENTS_FILE = path.join(process.cwd(), '.underleaf', 'comments.json');
const TEST_DELAY = 3000; // 3 seconds between tests

// Sample AI comments to add
const TEST_COMMENTS = [
  {
    fileName: 'README.md',
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 50,
    selectedText: '# Underleaf',
    content: 'AI Comment: This is a great project title! Consider adding a subtitle to describe what Underleaf does.',
    author: 'Claude AI'
  },
  {
    fileName: 'frontend/src/routes/editor/+page.svelte',
    startLine: 10,
    startColumn: 1,
    endLine: 10,
    endColumn: 80,
    selectedText: 'import CommentModal from \'$components/CommentModal.svelte\';',
    content: 'AI Comment: Good modular import structure. This will help with code organization.',
    author: 'Claude AI'
  },
  {
    fileName: 'backend/src/index.ts',
    startLine: 50,
    startColumn: 1,
    endLine: 52,
    endColumn: 1,
    selectedText: 'app.listen(port, () => {\n  console.log(`Server running on port ${port}`);\n});',
    content: 'AI Comment: Consider adding graceful shutdown handling for production environments.',
    author: 'Claude AI'
  }
];

/**
 * Generate a unique comment ID
 */
function generateCommentId() {
  return 'comment_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Create a comment object with proper timestamps
 */
function createComment(commentData) {
  const now = new Date().toISOString();
  return {
    id: generateCommentId(),
    fileName: commentData.fileName,
    startLine: commentData.startLine,
    startColumn: commentData.startColumn,
    endLine: commentData.endLine || commentData.startLine,
    endColumn: commentData.endColumn || 999,
    selectedText: commentData.selectedText || '',
    content: commentData.content,
    author: commentData.author,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Read existing comments from the file
 */
async function readComments() {
  try {
    // Ensure .underleaf directory exists
    await fs.mkdir(path.dirname(COMMENTS_FILE), { recursive: true });
    
    const data = await fs.readFile(COMMENTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []; // File doesn't exist, return empty array
    }
    throw error;
  }
}

/**
 * Save comments to the file
 */
async function saveComments(comments) {
  await fs.writeFile(COMMENTS_FILE, JSON.stringify(comments, null, 2));
  console.log(`✅ Saved ${comments.length} comments to ${COMMENTS_FILE}`);
}

/**
 * Add a new comment (simulating AI via MCP)
 */
async function addAiComment(commentData) {
  console.log(`\n🤖 AI is adding a comment to ${commentData.fileName}:${commentData.startLine}`);
  console.log(`   Content: "${commentData.content.substring(0, 60)}..."`);
  
  const existingComments = await readComments();
  const newComment = createComment(commentData);
  
  const updatedComments = [...existingComments, newComment];
  await saveComments(updatedComments);
  
  console.log(`   ✅ Comment added with ID: ${newComment.id}`);
  return newComment;
}

/**
 * Test the real-time synchronization
 */
async function testRealtimeSync() {
  console.log('🧪 Testing Real-time AI Comment Synchronization');
  console.log('=' .repeat(60));
  
  console.log('\n📋 Test Instructions:');
  console.log('1. Open the Underleaf editor in your browser');
  console.log('2. Make sure the Comments panel is visible');
  console.log('3. Watch for new comments to appear automatically');
  console.log('4. Check that the sync indicator shows "Live sync active"');
  
  console.log('\n⏱️  Starting test in 5 seconds...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Add each test comment with delays
  for (let i = 0; i < TEST_COMMENTS.length; i++) {
    const comment = TEST_COMMENTS[i];
    
    console.log(`\n--- Test ${i + 1}/${TEST_COMMENTS.length} ---`);
    await addAiComment(comment);
    
    if (i < TEST_COMMENTS.length - 1) {
      console.log(`\n⏳ Waiting ${TEST_DELAY / 1000} seconds before next comment...`);
      console.log('   (Check if the comment appeared in the frontend!)');
      await new Promise(resolve => setTimeout(resolve, TEST_DELAY));
    }
  }
  
  console.log('\n🎉 Test completed!');
  console.log('\n📊 Results:');
  console.log(`   - Added ${TEST_COMMENTS.length} AI comments`);
  console.log(`   - Comments saved to: ${COMMENTS_FILE}`);
  console.log('\n🔍 Verification:');
  console.log('   - Check that all comments appeared in the frontend Comments panel');
  console.log('   - Verify the sync indicator shows activity');
  console.log('   - Confirm comments are properly formatted and attributed to "Claude AI"');
  
  // Show final comment count
  const finalComments = await readComments();
  console.log(`\n📈 Total comments in file: ${finalComments.length}`);
}

/**
 * Clean up test comments (optional)
 */
async function cleanupTestComments() {
  console.log('\n🧹 Cleaning up test comments...');
  
  const comments = await readComments();
  const nonTestComments = comments.filter(c => !c.content.startsWith('AI Comment: '));
  
  await saveComments(nonTestComments);
  console.log(`✅ Removed ${comments.length - nonTestComments.length} test comments`);
  console.log(`📈 Remaining comments: ${nonTestComments.length}`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--cleanup')) {
    await cleanupTestComments();
  } else {
    await testRealtimeSync();
    
    // Ask if user wants to clean up
    console.log('\n❓ Run with --cleanup flag to remove test comments');
  }
}

// Error handling
main().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
}); 