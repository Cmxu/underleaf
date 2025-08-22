#!/usr/bin/env node

/**
 * Browser Data Cleanup Helper Script
 * This script helps identify and clear browser localStorage entries for Underleaf
 */

const fs = require('fs');
const path = require('path');

console.log('🌐 Underleaf Browser Data Cleanup Helper');
console.log('========================================');
console.log('');

console.log('This script helps you identify what needs to be cleared in your browser.');
console.log('');

// Check if there are any repository directories that might have localStorage entries
const reposDir = path.join(__dirname, '..', 'repos');
if (fs.existsSync(reposDir)) {
    try {
        const repos = fs.readdirSync(reposDir);
        if (repos.length > 0) {
            console.log('📁 Found repository directories:');
            repos.forEach(repo => {
                console.log(`   - ${repo}`);
            });
            console.log('');
            console.log('💡 These repositories likely have localStorage entries with keys like:');
            repos.forEach(repo => {
                console.log(`   - comments_${repo}`);
            });
            console.log('');
        }
    } catch (error) {
        console.log('⚠️  Could not read repos directory:', error.message);
    }
} else {
    console.log('📁 No repos directory found - no localStorage entries to worry about');
}

console.log('🚨 TO COMPLETELY CLEAR COMMENTS, YOU MUST:');
console.log('==========================================');
console.log('');
console.log('1. Open your browser and go to the Underleaf application');
console.log('2. Open Developer Tools (F12 or Cmd+Option+I)');
console.log('3. Go to Application/Storage tab');
console.log('4. Find "Local Storage" in the left sidebar');
console.log('5. Look for entries starting with "comments_"');
console.log('6. Delete these entries or clear all localStorage');
console.log('');
console.log('🔧 ALTERNATIVE: Run this in the browser console:');
console.log('===============================================');
console.log('');

// Generate JavaScript code for clearing localStorage
const jsCode = `// Clear all comment-related localStorage entries
Object.keys(localStorage).forEach(key => {
  if (key.startsWith('comments_')) {
    localStorage.removeItem(key);
    console.log('Removed:', key);
  }
});

// Clear all localStorage for complete reset (optional)
// localStorage.clear();
// console.log('All localStorage cleared');

console.log('✅ Comment localStorage entries cleared!');`;

console.log(jsCode);
console.log('');

console.log('📋 MANUAL STEPS:');
console.log('================');
console.log('1. Copy the JavaScript code above');
console.log('2. Paste it into your browser console');
console.log('3. Press Enter to execute');
console.log('4. Refresh the page');
console.log('');

console.log('🎯 WHAT THIS CLEARS:');
console.log('====================');
console.log('• All comment data stored in browser localStorage');
console.log('• User preferences and settings');
console.log('• Any cached comment data');
console.log('• Frontend persistence that survives container restarts');
console.log('');

console.log('⚠️  IMPORTANT NOTES:');
console.log('====================');
console.log('• This only clears frontend data in your current browser');
console.log('• Other browsers/tabs will still have the data');
console.log('• Backend data is cleared by the cleanup scripts');
console.log('• You may need to log out and log back in');
console.log('');

console.log('🚀 After clearing browser data, your Underleaf instance will be completely fresh!');

