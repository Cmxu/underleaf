#!/usr/bin/env node

const Docker = require('dockerode');
const fs = require('fs-extra');
const path = require('path');

const docker = new Docker();

async function testDockerMount() {
  console.log('🧪 Testing Docker bind mount for Claude authentication...');
  
  // Create a temporary directory
  const tempDir = path.join('/tmp', `test-mount-${Date.now()}`);
  await fs.ensureDir(tempDir);
  await fs.chmod(tempDir, 0o777);
  
  console.log(`📁 Created temp directory: ${tempDir}`);
  
  // Write a test file
  const testFilePath = path.join(tempDir, 'test.txt');
  await fs.writeFile(testFilePath, 'Hello from host!', 'utf8');
  await fs.chmod(testFilePath, 0o666);
  
  console.log(`📝 Created test file: ${testFilePath}`);
  
  try {
    // Create and run a test container
    const container = await docker.createContainer({
      Image: 'underleaf-latex:latest',
      Cmd: ['/bin/bash', '-c', `
        echo "=== Container Mount Test ===" &&
        echo "Mount point exists: $(test -d /tmp/test && echo YES || echo NO)" &&
        echo "Mount point contents:" && ls -la /tmp/test/ &&
        echo "Test file exists: $(test -f /tmp/test/test.txt && echo YES || echo NO)" &&
        echo "Test file content: $(cat /tmp/test/test.txt 2>/dev/null || echo 'FAILED TO READ')" &&
        echo "Writing from container..." &&
        echo "Hello from container!" > /tmp/test/container.txt &&
        chmod 666 /tmp/test/container.txt &&
        echo "Container write completed" &&
        ls -la /tmp/test/
      `],
      HostConfig: {
        AutoRemove: true,
        Binds: [`${tempDir}:/tmp/test:rw`]
      }
    });
    
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true
    });
    
    stream.pipe(process.stdout);
    
    await container.start();
    await container.wait();
    
    console.log('\n📋 Host directory after container run:');
    const dirContents = await fs.readdir(tempDir);
    for (const file of dirContents) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf8').catch(() => 'UNREADABLE');
      console.log(`  ${file}: ${stats.size} bytes, mode ${stats.mode.toString(8)}, content: "${content}"`);
    }
    
    // Check if container wrote file
    const containerFile = path.join(tempDir, 'container.txt');
    if (await fs.pathExists(containerFile)) {
      console.log('✅ Container successfully wrote to mounted directory!');
    } else {
      console.log('❌ Container failed to write to mounted directory!');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Clean up
    await fs.remove(tempDir);
    console.log('🧹 Cleaned up temp directory');
  }
}

if (require.main === module) {
  testDockerMount().catch(console.error);
}

module.exports = { testDockerMount }; 