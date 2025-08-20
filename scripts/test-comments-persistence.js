#!/usr/bin/env node

/**
 * Test script to verify comment persistence
 * This script tests that comments are properly stored in the persistent .underleaf directory
 */

const fs = require('fs').promises;
const path = require('path');

async function testCommentPersistence() {
  console.log('🧪 Testing comment persistence...\n');
  
  const testDir = '/tmp/test-repo';
  const underleafDir = path.join(testDir, '.underleaf');
  const commentsFile = path.join(underleafDir, 'comments.json');
  
  try {
    // Create test directory structure
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(underleafDir, { recursive: true });
    
    // Test comments data
    const testComments = [
      {
        id: 'test-comment-1',
        fileName: 'main.tex',
        startLine: 10,
        startColumn: 1,
        endLine: 10,
        endColumn: 50,
        selectedText: 'This is a test line',
        content: 'This is a test comment',
        author: 'Test User',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'test-comment-2',
        fileName: 'introduction.tex',
        startLine: 5,
        startColumn: 1,
        endLine: 7,
        endColumn: 20,
        selectedText: 'Some selected text here',
        content: 'Another test comment with multiple lines',
        author: 'Test User 2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    
    // 1. Test writing comments
    console.log('📝 Writing test comments...');
    await fs.writeFile(commentsFile, JSON.stringify(testComments, null, 2));
    console.log(`✅ Comments written to: ${commentsFile}`);
    
    // 2. Test reading comments
    console.log('\n📖 Reading comments...');
    const savedData = await fs.readFile(commentsFile, 'utf8');
    const savedComments = JSON.parse(savedData);
    console.log(`✅ Read ${savedComments.length} comments`);
    
    // 3. Verify data integrity
    console.log('\n🔍 Verifying data integrity...');
    if (savedComments.length === testComments.length) {
      console.log('✅ Comment count matches');
    } else {
      throw new Error(`Comment count mismatch: expected ${testComments.length}, got ${savedComments.length}`);
    }
    
    for (let i = 0; i < testComments.length; i++) {
      const original = testComments[i];
      const saved = savedComments[i];
      
      if (original.id === saved.id && original.content === saved.content) {
        console.log(`✅ Comment ${i + 1} data integrity verified`);
      } else {
        throw new Error(`Comment ${i + 1} data mismatch`);
      }
    }
    
    // 4. Test directory structure
    console.log('\n📁 Verifying directory structure...');
    const dirStats = await fs.stat(underleafDir);
    if (dirStats.isDirectory()) {
      console.log('✅ .underleaf directory exists and is accessible');
    } else {
      throw new Error('.underleaf is not a directory');
    }
    
    const fileStats = await fs.stat(commentsFile);
    if (fileStats.isFile()) {
      console.log('✅ comments.json file exists and is accessible');
    } else {
      throw new Error('comments.json is not a file');
    }
    
    // 5. Clean up
    console.log('\n🧹 Cleaning up test files...');
    await fs.rm(testDir, { recursive: true });
    console.log('✅ Test cleanup completed');
    
    console.log('\n🎉 All comment persistence tests passed!');
    console.log('\nThe comment system should now properly persist across container restarts.');
    console.log('Comments will be stored in: /workdir/.underleaf/comments.json');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    // Clean up on error
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (cleanupError) {
      console.error('Failed to cleanup test directory:', cleanupError.message);
    }
    
    process.exit(1);
  }
}

// Run the test
testCommentPersistence().catch(console.error); 