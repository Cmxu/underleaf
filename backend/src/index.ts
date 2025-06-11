import express from 'express';
import path from 'path';
import fs from 'fs-extra';
// import simpleGit from 'simple-git'; // Now using containerized Git operations
import type { 
  CloneRepoRequest, 
  CompileRepoRequest, 
  GitCommitRequest, 
  GitPushRequest,
  CreateFileRequest,
  CreateFolderRequest,
  DeleteFileRequest,
  RenameFileRequest,
  ClaudeAiRequest,
  ContainerStatsResponse
} from './types/api';
import { containerService } from './services/containerService';

const app = express();
const port = process.env.PORT || 3001;
// Legacy: Keep for old file-based endpoints (deprecated)
const REPO_BASE_PATH = process.env.REPO_BASE_PATH || path.join(__dirname, '..', '..', 'repos');

app.use(express.json());

// CORS middleware for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.get('/', (_req, res) => {
  res.send('Underleaf backend');
});

app.post('/api/clone', async (req, res) => {
  try {
    const { repoUrl, userId = 'anonymous', credentials } = req.body as CloneRepoRequest;
    
    if (!repoUrl) {
      return res.status(400).json({ error: 'repoUrl is required' });
    }

    // Validate and normalize the repository URL
    let normalizedRepoUrl = repoUrl.trim();
    
    // Handle common URL format issues
    if (normalizedRepoUrl.includes('git@') && !normalizedRepoUrl.includes('://')) {
      // SSH URL format: git@host/path or git@host:path
      const sshPattern = /^git@([^/:]+)[/:](.*?)(?:\.git)?$/;
      const match = normalizedRepoUrl.match(sshPattern);
      
      if (match) {
        const [, host, path] = match;
        
        // For Overleaf and similar services that need authentication, convert to HTTPS
        if (host.includes('overleaf.com') || host.includes('github.com') || host.includes('gitlab.com') || host.includes('bitbucket.org')) {
          normalizedRepoUrl = `https://${host}/${path}.git`;
        } else {
          // For other hosts, keep SSH format but fix the syntax
          normalizedRepoUrl = `git@${host}:${path}.git`;
        }
      } else if (!normalizedRepoUrl.endsWith('.git')) {
        normalizedRepoUrl += '.git';
      }
    } else if (normalizedRepoUrl.includes('git@') && normalizedRepoUrl.includes('://')) {
      // Handle malformed URLs like "https://git@host/path"
      const malformedPattern = /^https:\/\/git@([^/:]+)[/:](.*?)(?:\.git)?$/;
      const match = normalizedRepoUrl.match(malformedPattern);
      
      if (match) {
        const [, host, path] = match;
        normalizedRepoUrl = `https://${host}/${path}.git`;
      }
    }
    
    const repoName = path.basename(normalizedRepoUrl, '.git');
    console.log(`Cloning repository ${normalizedRepoUrl} for user ${userId} into container volume`);

    try {
      // Check if repository volume already exists
      const volumeInfo = containerService.getRepoVolumeInfo(repoName);
      
      if (volumeInfo) {
        // Repository already exists, try to update it
        console.log(`Repository ${repoName} already exists, pulling latest changes`);
        try {
          // Setup credentials if provided
          if (credentials && credentials.username && normalizedRepoUrl.startsWith('https://')) {
            // For Overleaf, use "git" as username and token as password
            // For other services, use username + password/token
            let gitUsername, gitPassword;
            if (normalizedRepoUrl.includes('overleaf.com')) {
              // Overleaf requires username "git" and token as password
              gitUsername = 'git';
              gitPassword = credentials.username; // Frontend sends token as username for Overleaf
            } else {
              // GitHub/GitLab use username + token
              gitUsername = credentials.username;
              gitPassword = credentials.password || '';
            }
            
            // Create a credential helper script in the container
            const credHelperScript = `#!/bin/bash
case "$1" in
  get)
    echo "username=${gitUsername}"
    echo "password=${gitPassword}"
    ;;
esac`;
            
            // Create the credential helper script
            await containerService.executeInUserContainer(
              userId, 
              repoName, 
              ['sh', '-c', `cat > /tmp/git-creds.sh << 'EOF'\n${credHelperScript}\nEOF`]
            );
            
            // Make it executable
            await containerService.executeInUserContainer(userId, repoName, [
              'chmod', '+x', '/tmp/git-creds.sh'
            ]);
            
            // Configure Git globally to use our credential helper
            await containerService.executeInUserContainer(userId, repoName, [
              'git', 'config', '--global', 'credential.helper', '/tmp/git-creds.sh'
            ]);
            
            // Also configure Git globally to prevent interactive prompts
            await containerService.executeInUserContainer(userId, repoName, [
              'git', 'config', '--global', 'core.askpass', ''
            ]);
            
            await containerService.executeInUserContainer(userId, repoName, [
              'git', 'config', '--global', 'credential.modalprompt', 'false'
            ]);
          }
          
          const pullCommand = ['git', 'pull'];
          await containerService.executeInUserContainer(userId, repoName, pullCommand);
          return res.json({ 
            message: 'Repository updated', 
            repoName, 
            path: `/workdir` 
          });
        } catch (pullError) {
          console.warn('Git pull failed, repository may have local changes:', pullError);
          return res.json({ 
            message: 'Repository already exists (pull failed - may have local changes)', 
            repoName, 
            path: `/workdir` 
          });
        }
      } else {
        // Clone repository into a new volume via container
        console.log(`Cloning new repository ${repoName} into volume`);
        
        // First, get or create the user container (this also creates the volume)
        await containerService.getOrCreateUserContainer(userId, repoName);
        
        // Setup Git credentials using custom credential helper for secure authentication
        let cloneCommand: string[];
        
        if (credentials && credentials.username && normalizedRepoUrl.startsWith('https://')) {
          console.log('Setting up Git authentication with credentials');
          
          // For Overleaf, use "git" as username and token as password
          // For other services, use username + password/token
          let gitUsername, gitPassword;
          if (normalizedRepoUrl.includes('overleaf.com')) {
            // Overleaf requires username "git" and token as password
            gitUsername = 'git';
            gitPassword = credentials.username; // Frontend sends token as username for Overleaf
          } else {
            // GitHub/GitLab use username + token
            gitUsername = credentials.username;
            gitPassword = credentials.password || '';
          }
          
          // Create a credential helper script in the container
          const credHelperScript = `#!/bin/bash
case "$1" in
  get)
    echo "username=${gitUsername}"
    echo "password=${gitPassword}"
    ;;
esac`;
          
          try {
            // Create the credential helper script
            await containerService.executeInUserContainer(
              userId, 
              repoName, 
              ['sh', '-c', `cat > /tmp/git-creds.sh << 'EOF'\n${credHelperScript}\nEOF`]
            );
            
            // Make it executable
            await containerService.executeInUserContainer(userId, repoName, [
              'chmod', '+x', '/tmp/git-creds.sh'
            ]);
            
            // Configure Git globally to use our credential helper (since no .git repo exists yet)
            await containerService.executeInUserContainer(userId, repoName, [
              'git', 'config', '--global', 'credential.helper', '/tmp/git-creds.sh'
            ]);
            
            // Also configure Git globally to prevent interactive prompts
            await containerService.executeInUserContainer(userId, repoName, [
              'git', 'config', '--global', 'core.askpass', ''
            ]);
            
            await containerService.executeInUserContainer(userId, repoName, [
              'git', 'config', '--global', 'credential.modalprompt', 'false'
            ]);
            
            console.log('Global Git credential helper configured');
          } catch (credError) {
            console.error('Failed to setup Git credentials:', credError);
            throw new Error('Failed to setup Git authentication');
          }
        }
        
        // Build git clone command with environment variables to prevent prompts
        cloneCommand = ['git', 'clone', normalizedRepoUrl, '.'];
        console.log(`Executing git clone command: ${cloneCommand.join(' ')}`);
        
        // Clone the repository inside the container
        try {
          const cloneResult = await containerService.executeInUserContainer(userId, repoName, cloneCommand);
          console.log('Git clone completed successfully');
          console.log('Clone stdout:', cloneResult.stdout);
          if (cloneResult.stderr) {
            console.log('Clone stderr:', cloneResult.stderr);
          }
        } catch (cloneError) {
          console.error('Git clone failed:', cloneError);
          const errorMessage = cloneError instanceof Error ? cloneError.message : 'Unknown error';
          
          // Provide more helpful error messages based on the error
          if (errorMessage.includes('403') && normalizedRepoUrl.includes('overleaf.com')) {
            throw new Error(`Access denied to Overleaf repository. Please verify: 1) Repository ID is correct, 2) Git token is valid and current, 3) Email matches your Overleaf account.`);
          } else if (errorMessage.includes('128') && normalizedRepoUrl.includes('overleaf.com')) {
            throw new Error(`Failed to clone Overleaf repository. Please check your Git token and ensure you have access to this repository.`);
          } else if (errorMessage.includes('128') && (errorMessage.includes('Authentication') || errorMessage.includes('could not read'))) {
            throw new Error(`Authentication failed. Please check your credentials and try again.`);
          } else if (errorMessage.includes('128') && errorMessage.includes('not found')) {
            throw new Error(`Repository not found. Please check the repository URL.`);
          } else {
            throw new Error(`Failed to clone repository: ${errorMessage}`);
          }
        }
        
        return res.json({ 
          message: 'Repository cloned', 
          repoName, 
          path: `/workdir` 
        });
      }
    } catch (containerError) {
      console.error('Container operation failed:', containerError);
      return res.status(500).json({ error: 'Failed to clone repository in container' });
    }
    
  } catch (err) {
    console.error('Clone error:', err);
    return res.status(500).json({ error: 'Failed to clone repository' });
  }
});

// Ensure user container is running for a repository
app.post('/api/containers/:userId/:repoName/ensure', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    
    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    console.log(`Ensuring container is running for user ${userId} with repo ${repoName}`);
    
    try {
      // This will create or start the user's container
      const containerInfo = await containerService.getOrCreateUserContainer(userId, repoName);
      
      return res.json({ 
        message: 'Container is ready',
        containerName: containerInfo.containerName,
        status: containerInfo.status,
        volumeName: containerInfo.volumeName
      });
      
    } catch (containerError) {
      console.error('Container ensure error:', containerError);
      return res.status(500).json({ error: 'Failed to ensure container is running' });
    }
    
  } catch (err) {
    console.error('Container ensure error:', err);
    return res.status(500).json({ error: 'Failed to ensure container is running' });
  }
});

// Get file tree for a repository
app.get('/api/files/:userId/:repoName', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    
    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    console.log(`Getting file tree for ${repoName} via container for user ${userId}`);
    
    try {
      // Ensure user's container is running
      await containerService.getOrCreateUserContainer(userId, repoName);
      
      // First, check if the repository directory exists and has content
      try {
        const { stdout: testOutput } = await containerService.executeInUserContainer(
          userId,
          repoName,
          ['sh', '-c', 'if [ -d "/workdir" ] && [ "$(ls -A /workdir 2>/dev/null)" ]; then echo "ready"; else echo "empty"; fi']
        );
        
        if (testOutput.trim() === 'empty') {
          console.log(`Repository ${repoName} container exists but directory is empty - may still be cloning`);
          return res.status(404).json({ error: 'Repository is still being prepared. Please wait a moment and try again.' });
        }
      } catch (testError) {
        console.error('Failed to test repository readiness:', testError);
        return res.status(500).json({ error: 'Failed to check repository status' });
      }
      
      // Get file tree using container command
      const { stdout } = await containerService.executeInUserContainer(
        userId, 
        repoName, 
        ['find', '.', '-type', 'f', '-o', '-type', 'd', '!', '-path', './.*', '!', '-path', './node_modules*']
      );
      
      const paths = stdout.trim().split('\n').filter(p => p.trim() !== '' && p !== '.');
      
      if (paths.length === 0) {
        console.log(`Repository ${repoName} found but appears to be empty`);
        return res.json({ tree: [] });
      }
      
      const fileTree = buildFileTreeFromPaths(paths);
      console.log(`File tree loaded for ${repoName}: ${paths.length} items found`);
      
      return res.json({ tree: fileTree });
      
    } catch (containerError) {
      console.error('Container file tree error:', containerError);
      return res.status(500).json({ error: 'Failed to get file tree from container' });
    }
    
  } catch (err) {
    console.error('File tree error:', err);
    return res.status(500).json({ error: 'Failed to get file tree' });
  }
});

// Get file content
app.get('/api/files/:userId/:repoName/content', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    const { filePath } = req.query as { filePath: string };
    
    if (!filePath) {
      return res.status(400).json({ error: 'filePath query parameter is required' });
    }
    
    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    // Security check: ensure the file path is safe
    if (filePath.includes('..') || filePath.startsWith('/')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    try {
      // Ensure user's container is running
      await containerService.getOrCreateUserContainer(userId, repoName);
      
      // Read file content via container
      const { stdout } = await containerService.executeInUserContainer(
        userId, 
        repoName, 
        ['cat', filePath]
      );
      
      return res.json({ content: stdout });
      
    } catch (containerError) {
      // Check if it's a "file not found" error
      if (containerError instanceof Error && containerError.message.includes('No such file')) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      console.error('Container file read error:', containerError);
      return res.status(500).json({ error: 'Failed to read file from container' });
    }
    
  } catch (err) {
    console.error('File content error:', err);
    return res.status(500).json({ error: 'Failed to read file' });
  }
});

// Save file content
app.put('/api/files/:userId/:repoName/content', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    const { filePath, content } = req.body;
    
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'filePath and content are required' });
    }
    
    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    // Security check: ensure the file path is safe
    if (filePath.includes('..') || filePath.startsWith('/')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    try {
      // Ensure user's container is running
      await containerService.getOrCreateUserContainer(userId, repoName);
      
      // Create directory if needed and save file via container
      const dir = path.dirname(filePath);
      if (dir !== '.' && dir !== '') {
        await containerService.executeInUserContainer(
          userId, 
          repoName, 
          ['mkdir', '-p', dir]
        );
      }
      
      // Write file content via container using echo
      const escapedContent = content.replace(/'/g, "'\"'\"'");
      await containerService.executeInUserContainer(
        userId, 
        repoName, 
        ['sh', '-c', `echo '${escapedContent}' > "${filePath}"`]
      );
      
      return res.json({ message: 'File saved successfully' });
      
    } catch (containerError) {
      console.error('Container file save error:', containerError);
      return res.status(500).json({ error: 'Failed to save file in container' });
    }
    
  } catch (err) {
    console.error('File save error:', err);
    return res.status(500).json({ error: 'Failed to save file' });
  }
});

// Create new file
app.post('/api/files/:userId/:repoName/create-file', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    const { filePath, content = '' } = req.body as CreateFileRequest;
    
    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }
    
    const repoPath = path.join(REPO_BASE_PATH, userId, repoName);
    const fullFilePath = path.join(repoPath, filePath);
    
    // Security check: ensure the file is within the repository
    if (!fullFilePath.startsWith(repoPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if file already exists
    if (await fs.pathExists(fullFilePath)) {
      return res.status(409).json({ error: 'File already exists' });
    }
    
    await fs.ensureDir(path.dirname(fullFilePath));
    await fs.writeFile(fullFilePath, content, 'utf-8');
    
    return res.json({ message: 'File created successfully' });
  } catch (err) {
    console.error('File create error:', err);
    return res.status(500).json({ error: 'Failed to create file' });
  }
});

// Create new folder
app.post('/api/files/:userId/:repoName/create-folder', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    const { folderPath } = req.body as CreateFolderRequest;
    
    if (!folderPath) {
      return res.status(400).json({ error: 'folderPath is required' });
    }
    
    const repoPath = path.join(REPO_BASE_PATH, userId, repoName);
    const fullFolderPath = path.join(repoPath, folderPath);
    
    // Security check: ensure the folder is within the repository
    if (!fullFolderPath.startsWith(repoPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if folder already exists
    if (await fs.pathExists(fullFolderPath)) {
      return res.status(409).json({ error: 'Folder already exists' });
    }
    
    await fs.ensureDir(fullFolderPath);
    
    return res.json({ message: 'Folder created successfully' });
  } catch (err) {
    console.error('Folder create error:', err);
    return res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Delete file or folder
app.delete('/api/files/:userId/:repoName/delete', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    const { filePath } = req.body as DeleteFileRequest;
    
    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }
    
    const repoPath = path.join(REPO_BASE_PATH, userId, repoName);
    const fullPath = path.join(repoPath, filePath);
    
    // Security check: ensure the path is within the repository
    if (!fullPath.startsWith(repoPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if path exists
    if (!(await fs.pathExists(fullPath))) {
      return res.status(404).json({ error: 'File or folder not found' });
    }
    
    await fs.remove(fullPath);
    
    return res.json({ message: 'File or folder deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    return res.status(500).json({ error: 'Failed to delete file or folder' });
  }
});

// Rename/move file or folder
app.put('/api/files/:userId/:repoName/rename', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    const { oldPath, newPath } = req.body as RenameFileRequest;
    
    if (!oldPath || !newPath) {
      return res.status(400).json({ error: 'oldPath and newPath are required' });
    }
    
    const repoPath = path.join(REPO_BASE_PATH, userId, repoName);
    const fullOldPath = path.join(repoPath, oldPath);
    const fullNewPath = path.join(repoPath, newPath);
    
    // Security check: ensure both paths are within the repository
    if (!fullOldPath.startsWith(repoPath) || !fullNewPath.startsWith(repoPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if old path exists
    if (!(await fs.pathExists(fullOldPath))) {
      return res.status(404).json({ error: 'File or folder not found' });
    }
    
    // Check if new path already exists
    if (await fs.pathExists(fullNewPath)) {
      return res.status(409).json({ error: 'Destination already exists' });
    }
    
    // Ensure the parent directory of the new path exists
    await fs.ensureDir(path.dirname(fullNewPath));
    
    // Move the file or folder
    await fs.move(fullOldPath, fullNewPath);
    
    return res.json({ message: 'File or folder renamed successfully' });
  } catch (err) {
    console.error('Rename error:', err);
    return res.status(500).json({ error: 'Failed to rename file or folder' });
  }
});

// Serve PDF files
app.get('/api/files/:userId/:repoName/pdf/:filename', async (req, res) => {
  try {
    const { userId, repoName, filename } = req.params;
    const repoPath = path.join(REPO_BASE_PATH, userId, repoName);
    const pdfPath = path.join(repoPath, filename);
    
    // Security check: ensure the file is within the repository
    if (!pdfPath.startsWith(repoPath) || !filename.endsWith('.pdf')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!(await fs.pathExists(pdfPath))) {
      return res.status(404).json({ error: 'PDF not found' });
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);
  } catch (err) {
    console.error('PDF serve error:', err);
    return res.status(500).json({ error: 'Failed to serve PDF' });
  }
});

function buildFileTreeFromPaths(paths: string[]): any {
  const tree: any[] = [];
  const pathMap = new Map();
  
  // Sort paths to ensure parent directories come before children
  paths.sort();
  
  for (const fullPath of paths) {
    if (fullPath === '.' || fullPath === '') continue;
    
    const relativePath = fullPath.startsWith('./') ? fullPath.slice(2) : fullPath;
    const parts = relativePath.split('/');
    const name = parts[parts.length - 1];
    
    // Determine if it's a directory (ends with no extension or has children)
    const isDirectory = !name.includes('.') || paths.some(p => p.startsWith(fullPath + '/'));
    
    const item = {
      name,
      type: isDirectory ? 'directory' : 'file',
      path: relativePath,
      ...(isDirectory && { children: [] })
    };
    
    if (parts.length === 1) {
      // Root level item
      tree.push(item);
      pathMap.set(relativePath, item);
    } else {
      // Find parent and add as child
      const parentPath = parts.slice(0, -1).join('/');
      const parent = pathMap.get(parentPath);
      if (parent && parent.children) {
        parent.children.push(item);
      }
      pathMap.set(relativePath, item);
    }
  }
  
  // Sort each level: directories first, then files, both alphabetically
  const sortLevel = (items: any[]) => {
    items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    
    items.forEach(item => {
      if (item.children) {
        sortLevel(item.children);
      }
    });
  };
  
  sortLevel(tree);
  return tree;
}

// Commented out unused function - replaced by container service
// async function compileWithDocker(repoPath: string, texFile: string): Promise<void> {
//   const dockerCommand = `docker run --rm -v ${repoPath}:/workdir latex pdflatex -interaction=nonstopmode ${texFile}`;
//   await execAsync(dockerCommand);
// }

// Removed createSamplePdf function - now handled inline in container
/* 
async function createSamplePdf(repoPath: string, texFile: string): Promise<void> {
  // Create a sample PDF using a simple LaTeX document for demo purposes
  const sampleLatex = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\title{Underleaf Demo}
\\author{Compiled Successfully}
\\date{\\today}
\\begin{document}
\\maketitle
\\section{Welcome to Underleaf}
This is a demonstration PDF showing that compilation is working.

\\textbf{Note:} LaTeX compilation is working! You can now edit and compile real LaTeX documents.

\\subsection{Getting Started}
\\begin{itemize}
\\item Edit your LaTeX files in the editor
\\item Click "Compile PDF" to generate the output
\\item View the PDF in the preview pane
\\end{itemize}

\\subsection{Features}
\\begin{itemize}
\\item Real-time LaTeX editing with syntax highlighting
\\item Auto-save functionality
\\item File tree browser
\\item PDF preview with right-side thumbnails
\\item Git repository integration
\\end{itemize}

\\section{Mathematical Expressions}
You can include mathematical expressions like:
\\[ E = mc^2 \\]

And inline math like $\\pi \\approx 3.14159$.

\\section{Next Steps}
\\begin{enumerate}
\\item Clone a LaTeX repository from GitHub
\\item Edit the files using the Monaco editor
\\item Compile and preview your changes
\\item Enjoy the seamless LaTeX editing experience!
\\end{enumerate}

\\end{document}`;

  const texPath = path.join(repoPath, texFile);
  await fs.writeFile(texPath, sampleLatex);
  
  // Always try to compile with pdflatex first since it's available
  try {
    if (await checkPdflatexAvailable()) {
      console.log('Creating demo PDF with pdflatex');
      await compileWithPdflatex(repoPath, texFile);
    } else {
      throw new Error('pdflatex not available');
    }
  } catch (error) {
    console.log('pdflatex failed for demo, creating minimal PDF placeholder');
    // Only as absolute last resort, create a minimal valid PDF
    const pdfPath = path.join(repoPath, texFile.replace('.tex', '.pdf'));
    const minimalPdf = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, // %PDF-1.4
      0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A, // binary comment
      0x31, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, // 1 0 obj
      0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, 0x43, 0x61, 0x74, 0x61, 0x6C, 0x6F, 0x67, 0x2F, 0x50, 0x61, 0x67, 0x65, 0x73, 0x20, 0x32, 0x20, 0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A, // <</Type/Catalog/Pages 2 0 R>>
      0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A, // endobj
      0x32, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, // 2 0 obj
      0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, 0x50, 0x61, 0x67, 0x65, 0x73, 0x2F, 0x4B, 0x69, 0x64, 0x73, 0x5B, 0x33, 0x20, 0x30, 0x20, 0x52, 0x5D, 0x2F, 0x43, 0x6F, 0x75, 0x6E, 0x74, 0x20, 0x31, 0x3E, 0x3E, 0x0A, // <</Type/Pages/Kids[3 0 R]/Count 1>>
      0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A, // endobj
      0x33, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, // 3 0 obj
      0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, 0x50, 0x61, 0x67, 0x65, 0x2F, 0x50, 0x61, 0x72, 0x65, 0x6E, 0x74, 0x20, 0x32, 0x20, 0x30, 0x20, 0x52, 0x2F, 0x4D, 0x65, 0x64, 0x69, 0x61, 0x42, 0x6F, 0x78, 0x5B, 0x30, 0x20, 0x30, 0x20, 0x36, 0x31, 0x32, 0x20, 0x37, 0x39, 0x32, 0x5D, 0x3E, 0x3E, 0x0A, // <</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>
      0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A, // endobj
      0x78, 0x72, 0x65, 0x66, 0x0A, 0x30, 0x20, 0x34, 0x0A, // xref 0 4
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x36, 0x35, 0x35, 0x33, 0x35, 0x20, 0x66, 0x20, 0x0A, // 0000000000 65535 f
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x39, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6E, 0x20, 0x0A, // 0000000009 00000 n
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x35, 0x38, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6E, 0x20, 0x0A, // 0000000058 00000 n
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x31, 0x31, 0x35, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6E, 0x20, 0x0A, // 0000000115 00000 n
      0x74, 0x72, 0x61, 0x69, 0x6C, 0x65, 0x72, 0x0A, 0x3C, 0x3C, 0x2F, 0x53, 0x69, 0x7A, 0x65, 0x20, 0x34, 0x2F, 0x52, 0x6F, 0x6F, 0x74, 0x20, 0x31, 0x20, 0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A, // trailer <</Size 4/Root 1 0 R>>
      0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66, 0x0A, 0x31, 0x37, 0x34, 0x0A, 0x25, 0x25, 0x45, 0x4F, 0x46 // startxref 174 %%EOF
    ]);
    await fs.writeFile(pdfPath, minimalPdf);
  }
}
*/

app.post('/api/compile', async (req, res) => {
  try {
    const { userId = 'anonymous', repoName, texFile = 'main.tex' } = req.body as CompileRepoRequest;
    
    if (!repoName) {
      return res.status(400).json({ error: 'repoName is required' });
    }

    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    console.log(`Compiling ${texFile} in container for user ${userId} with repo ${repoName}`);
    
    try {
      // Ensure user's container is running
      await containerService.getOrCreateUserContainer(userId, repoName);
      
      // Check if the tex file exists via container
      let actualTexFile = texFile;
      try {
        await containerService.executeInUserContainer(userId, repoName, ['test', '-f', texFile]);
      } catch {
        console.log(`TeX file ${texFile} not found, looking for common alternatives...`);
        
        // Look for common LaTeX main files via container
        const commonFiles = ['paper.tex', 'main.tex', 'document.tex', 'article.tex'];
        let foundFile = null;
        
        for (const file of commonFiles) {
          try {
            await containerService.executeInUserContainer(userId, repoName, ['test', '-f', file]);
            foundFile = file;
            break;
          } catch {
            // File doesn't exist, continue
          }
        }
        
        if (foundFile) {
          console.log(`Found ${foundFile}, using it instead`);
          actualTexFile = foundFile;
        } else {
          // Create a simple LaTeX file for demo via container
          console.log(`No LaTeX files found, creating demo file`);
          const sampleLatex = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\title{Underleaf Demo}
\\author{Compiled Successfully}
\\date{\\today}
\\begin{document}
\\maketitle
\\section{Welcome to Underleaf}
This is a demonstration PDF showing that compilation is working.

\\textbf{Note:} LaTeX compilation is working! You can now edit and compile real LaTeX documents.
\\end{document}`;
          
          const escapedContent = sampleLatex.replace(/'/g, "'\"'\"'");
          await containerService.executeInUserContainer(
            userId, 
            repoName, 
            ['sh', '-c', `echo '${escapedContent}' > "${texFile}"`]
          );
          
          // Compile the demo file
          await containerService.executeInUserContainer(
            userId, 
            repoName, 
            ['pdflatex', '-interaction=nonstopmode', '-output-directory=.', texFile]
          );
          
          const pdfFile = texFile.replace('.tex', '.pdf');
          return res.json({ 
            message: 'Demo PDF created (no LaTeX files found in repository)',
            pdfFile: pdfFile,
            pdfUrl: `/api/files/${userId}/${repoName}/pdf/${pdfFile}`
          });
        }
      }
      
      // Use containerized LaTeX compilation for each user
      console.log(`Using user container for LaTeX compilation: ${userId}/${repoName}`);
      const { stdout, stderr } = await containerService.executeInUserContainer(
        userId, 
        repoName, 
        ['pdflatex', '-interaction=nonstopmode', '-output-directory=.', actualTexFile]
      );
      
      if (stderr && !stdout) {
        console.warn('LaTeX compilation warnings/errors:', stderr);
      }
      
      const pdfFile = actualTexFile.replace('.tex', '.pdf');
      
      // Check if PDF was created via container
      try {
        await containerService.executeInUserContainer(userId, repoName, ['test', '-f', pdfFile]);
        
        // Get file size via container
        const { stdout: sizeOutput } = await containerService.executeInUserContainer(
          userId, 
          repoName, 
          ['stat', '-c', '%s', pdfFile]
        );
        const size = parseInt(sizeOutput.trim()) || 0;
        
        console.log(`PDF created successfully: ${pdfFile} (${size} bytes)`);
        return res.json({ 
          message: 'Compilation finished successfully',
          pdfFile: pdfFile,
          pdfUrl: `/api/files/${userId}/${repoName}/pdf/${pdfFile}`
        });
      } catch {
        throw new Error('PDF was not generated');
      }
      
    } catch (compileError) {
      console.error('Compilation failed:', compileError);
      return res.status(500).json({ 
        error: 'Compilation failed', 
        details: compileError instanceof Error ? compileError.message : 'Unknown error'
      });
    }
    
  } catch (err) {
    console.error('Compile error:', err);
    return res.status(500).json({ error: 'Compilation failed' });
  }
});

// Git status endpoint
app.get('/api/git/:userId/:repoName/status', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    
    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    console.log(`Getting git status for ${repoName} via container for user ${userId}`);
    
    try {
      // Ensure user's container is running
      await containerService.getOrCreateUserContainer(userId, repoName);
      
      // Get git status via container
      const { stdout } = await containerService.executeInUserContainer(
        userId, 
        repoName, 
        ['git', 'status', '--porcelain=v1', '--branch']
      );
      
      // Parse git status output
      const lines = stdout.split('\n').filter(line => line.trim());
      const modified: string[] = [];
      const added: string[] = [];
      const deleted: string[] = [];
      const untracked: string[] = [];
      let currentBranch = 'master';
      let tracking: string | undefined;
      
      for (const line of lines) {
        if (line.startsWith('##')) {
          // Branch information
          const branchInfo = line.slice(3);
          const branchMatch = branchInfo.match(/^([^.]+)/);
          if (branchMatch) {
            currentBranch = branchMatch[1];
          }
          if (branchInfo.includes('...')) {
            const trackingMatch = branchInfo.match(/\.\.\.([^[\s]+)/);
            if (trackingMatch) {
              tracking = trackingMatch[1];
            }
          }
        } else {
          const status = line.slice(0, 2);
          const filePath = line.slice(3);
          
          if (status[0] === 'M' || status[1] === 'M') {
            modified.push(filePath);
          } else if (status[0] === 'A' || status[1] === 'A') {
            added.push(filePath);
          } else if (status[0] === 'D' || status[1] === 'D') {
            deleted.push(filePath);
          } else if (status === '??') {
            untracked.push(filePath);
          }
        }
      }
      
      const clean = modified.length === 0 && added.length === 0 && deleted.length === 0 && untracked.length === 0;
      
      return res.json({
        modified,
        added,
        deleted,
        untracked,
        clean,
        currentBranch,
        tracking
      });
      
    } catch (containerError) {
      console.error('Container git status error:', containerError);
      return res.status(500).json({ error: 'Failed to get git status from container' });
    }
    
  } catch (err) {
    console.error('Git status error:', err);
    return res.status(500).json({ error: 'Failed to get Git status' });
  }
});

// Git commit endpoint
app.post('/api/git/:userId/:repoName/commit', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    const { message, author } = req.body as GitCommitRequest;
    
    if (!message) {
      return res.status(400).json({ error: 'Commit message is required' });
    }
    
    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    console.log(`Committing changes for ${repoName} via container for user ${userId}`);
    
    try {
      // Ensure user's container is running
      await containerService.getOrCreateUserContainer(userId, repoName);
      
      // Configure git user if provided
      if (author) {
        await containerService.executeInUserContainer(userId, repoName, [
          'git', 'config', 'user.name', author.name
        ]);
        await containerService.executeInUserContainer(userId, repoName, [
          'git', 'config', 'user.email', author.email
        ]);
      }
      
      // Add all modified and untracked files
      await containerService.executeInUserContainer(userId, repoName, [
        'git', 'add', '.'
      ]);
      
      // Commit changes
      const { stdout } = await containerService.executeInUserContainer(userId, repoName, [
        'git', 'commit', '-m', message
      ]);
      
      // Extract commit hash from output
      const commitMatch = stdout.match(/\[([^\]]+)\s+([a-f0-9]+)\]/);
      const hash = commitMatch ? commitMatch[2] : 'unknown';
      
      return res.json({
        message: 'Changes committed successfully',
        hash
      });
      
    } catch (containerError) {
      console.error('Container git commit error:', containerError);
      const errorMessage = containerError instanceof Error ? containerError.message : 'Unknown error';
      
      // Check if it's a "nothing to commit" error
      if (errorMessage.includes('nothing to commit')) {
        return res.status(400).json({ error: 'No changes to commit' });
      }
      
      return res.status(500).json({ error: 'Failed to commit changes in container' });
    }
    
  } catch (err) {
    console.error('Git commit error:', err);
    return res.status(500).json({ error: 'Failed to commit changes' });
  }
});

// Git push endpoint
app.post('/api/git/:userId/:repoName/push', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    const { remote = 'origin', branch } = req.body as GitPushRequest;
    
    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    console.log(`Pushing changes for ${repoName} via container for user ${userId}`);
    
    try {
      // Ensure user's container is running
      await containerService.getOrCreateUserContainer(userId, repoName);
      
      // Get current branch if not provided
      let pushBranch = branch;
      if (!pushBranch) {
        const { stdout } = await containerService.executeInUserContainer(userId, repoName, [
          'git', 'rev-parse', '--abbrev-ref', 'HEAD'
        ]);
        pushBranch = stdout.trim() || 'master';
      }
      
      // Push changes
      await containerService.executeInUserContainer(userId, repoName, [
        'git', 'push', remote, pushBranch
      ]);
      
      return res.json({
        message: 'Changes pushed successfully'
      });
      
    } catch (containerError) {
      console.error('Container git push error:', containerError);
      const errorMessage = containerError instanceof Error ? containerError.message : 'Unknown error';
      return res.status(500).json({ error: `Failed to push changes: ${errorMessage}` });
    }
    
  } catch (err) {
    console.error('Git push error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Failed to push changes';
    return res.status(500).json({ error: errorMessage });
  }
});

// Git fetch endpoint
app.post('/api/git/:userId/:repoName/fetch', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    const { remote = 'origin' } = req.body;
    
    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    console.log(`Fetching changes for ${repoName} via container for user ${userId}`);
    
    try {
      // Ensure user's container is running
      await containerService.getOrCreateUserContainer(userId, repoName);
      
      // Fetch changes from remote
      await containerService.executeInUserContainer(userId, repoName, [
        'git', 'fetch', remote
      ]);
      
      return res.json({
        message: 'Fetched changes successfully'
      });
      
    } catch (containerError) {
      console.error('Container git fetch error:', containerError);
      const errorMessage = containerError instanceof Error ? containerError.message : 'Unknown error';
      return res.status(500).json({ error: `Failed to fetch changes: ${errorMessage}` });
    }
    
  } catch (err) {
    console.error('Git fetch error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Failed to fetch changes';
    return res.status(500).json({ error: errorMessage });
  }
});

// Git pull endpoint
app.post('/api/git/:userId/:repoName/pull', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    const { remote = 'origin', branch } = req.body;
    
    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    console.log(`Pulling changes for ${repoName} via container for user ${userId}`);
    
    try {
      // Ensure user's container is running
      await containerService.getOrCreateUserContainer(userId, repoName);
      
      // Get current branch if not provided
      let pullBranch = branch;
      if (!pullBranch) {
        const { stdout } = await containerService.executeInUserContainer(userId, repoName, [
          'git', 'rev-parse', '--abbrev-ref', 'HEAD'
        ]);
        pullBranch = stdout.trim() || 'master';
      }
      
      // Pull changes from remote
      const { stdout } = await containerService.executeInUserContainer(userId, repoName, [
        'git', 'pull', remote, pullBranch
      ]);
      
      return res.json({
        message: 'Pulled changes successfully',
        summary: stdout
      });
      
    } catch (containerError) {
      console.error('Container git pull error:', containerError);
      const errorMessage = containerError instanceof Error ? containerError.message : 'Unknown error';
      return res.status(500).json({ error: `Failed to pull changes: ${errorMessage}` });
    }
    
  } catch (err) {
    console.error('Git pull error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Failed to pull changes';
    return res.status(500).json({ error: errorMessage });
  }
});

// Claude AI setup endpoint
app.get('/api/claude/setup', async (req, res) => {
  try {
    const { userId = 'anonymous', repoName } = req.query as { userId?: string; repoName?: string };
    
    if (!repoName) {
      return res.status(400).json({ error: 'repoName is required' });
    }

    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    try {
      // Ensure user's container is running
      await containerService.getOrCreateUserContainer(userId, repoName);
      
      // Check Claude configuration status
      const { stdout: configOutput } = await containerService.executeInUserContainer(
        userId,
        repoName,
        ['claude', 'config', 'list']
      );
      
      const config = JSON.parse(configOutput);
      
      return res.json({
        configured: !!process.env.ANTHROPIC_API_KEY,
        apiKeySet: !!process.env.ANTHROPIC_API_KEY,
        config,
        setupInstructions: {
          step1: "Get your API key from https://console.anthropic.com/",
          step2: "Set ANTHROPIC_API_KEY environment variable",
          step3: "Restart the backend server",
          alternativeSetup: "Or run 'claude config set -g anthropic.apiKey YOUR_KEY' manually"
        },
        authUrl: "https://console.anthropic.com/settings/keys"
      });
      
    } catch (containerError) {
      console.error('Container claude setup check error:', containerError);
      return res.status(500).json({ error: 'Failed to check Claude setup in container' });
    }
    
  } catch (err) {
    console.error('Claude setup endpoint error:', err);
    return res.status(500).json({ error: 'Failed to check Claude setup' });
  }
});

// Claude AI endpoint
app.post('/api/claude', async (req, res) => {
  try {
    const { userId = 'anonymous', repoName, message } = req.body as ClaudeAiRequest;
    
    if (!repoName || !message) {
      return res.status(400).json({ error: 'repoName and message are required' });
    }

    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    console.log(`Executing Claude command in container for ${repoName} with message: "${message}"`);
    
    try {
      // Set up environment variables for Claude CLI if API key is available
      const claudeEnv = process.env.ANTHROPIC_API_KEY ? 
        ['ANTHROPIC_API_KEY=' + process.env.ANTHROPIC_API_KEY] : [];
      
      // Execute Claude CLI command in the user's container
      // Using 'claude --print' for non-interactive output
      const { stdout, stderr } = await containerService.executeInUserContainer(
        userId,
        repoName,
        ['claude', '--print', '--output-format', 'text', message],
        undefined, // no stdin
        claudeEnv  // pass API key environment variable
      );
      
      if (stderr && stderr.includes('error') && !stdout) {
        throw new Error(stderr);
      }
      
      const response = stdout || stderr || 'No response from Claude';
      
      return res.json({
        message: 'Claude AI response received',
        response: response.trim()
      });
      
    } catch (claudeError) {
      console.error('Claude command failed:', claudeError);
      const errorMessage = claudeError instanceof Error ? claudeError.message : 'Unknown error';
      
      // Check if it's an authentication error
      if (errorMessage.includes('API key') || errorMessage.includes('authentication') || errorMessage.includes('auth')) {
        return res.status(500).json({ 
          error: 'Claude API authentication failed. Please set ANTHROPIC_API_KEY environment variable with your Anthropic API key.' 
        });
      }
      
      // Check if claude command is available in container
      try {
        await containerService.executeInUserContainer(
          userId, 
          repoName, 
          ['which', 'claude']
        );
      } catch {
        return res.status(500).json({ 
          error: 'Claude CLI not found in container. Please rebuild the LaTeX image with Claude CLI installed.' 
        });
      }
      
      return res.status(500).json({ 
        error: 'Claude AI request failed', 
        details: errorMessage
      });
    }
    
  } catch (err) {
    console.error('Claude AI endpoint error:', err);
    return res.status(500).json({ error: 'Failed to process Claude AI request' });
  }
  });

  // Container management endpoints
  app.get('/api/containers/stats', async (_req, res) => {
    try {
      const containers = containerService.getAllUserContainers();
      const volumes = containerService.getAllRepoVolumes();
      const response: ContainerStatsResponse = {
        containers,
        volumes,
        totalContainers: containers.length,
        totalVolumes: volumes.length
      };
      return res.json(response);
    } catch (err) {
      console.error('Container stats error:', err);
      return res.status(500).json({ error: 'Failed to get container stats' });
    }
  });

  app.get('/api/containers/:userId/:repoName', async (req, res) => {
    try {
      const { userId, repoName } = req.params;
      const containerInfo = await containerService.getUserContainerInfo(userId, repoName);
      
      if (!containerInfo) {
        return res.status(404).json({ error: 'Container not found' });
      }
      
      return res.json(containerInfo);
    } catch (err) {
      console.error('Container info error:', err);
      return res.status(500).json({ error: 'Failed to get container information' });
    }
  });

  app.delete('/api/containers/:userId/:repoName', async (req, res) => {
    try {
      const { userId, repoName } = req.params;
      await containerService.removeUserContainer(userId, repoName);
      return res.json({ message: 'Container removed successfully' });
    } catch (err) {
      console.error('Container removal error:', err);
      return res.status(500).json({ error: 'Failed to remove container' });
    }
  });

  app.get('/api/repositories/:repoName/containers', async (req, res) => {
    try {
      const { repoName } = req.params;
      const containers = containerService.getContainersForRepo(repoName);
      const volumeInfo = containerService.getRepoVolumeInfo(repoName);
      
      return res.json({
        repoName,
        containers,
        volume: volumeInfo,
        collaborators: containers.length
      });
    } catch (err) {
      console.error('Repository containers error:', err);
      return res.status(500).json({ error: 'Failed to get repository information' });
    }
  });

  app.get('/api/volumes/:repoName', async (req, res) => {
    try {
      const { repoName } = req.params;
      const volumeInfo = containerService.getRepoVolumeInfo(repoName);
      
      if (!volumeInfo) {
        return res.status(404).json({ error: 'Volume not found' });
      }
      
      return res.json(volumeInfo);
    } catch (err) {
      console.error('Volume info error:', err);
      return res.status(500).json({ error: 'Failed to get volume information' });
    }
  });

  // Administrative endpoint for manual volume cleanup (use with extreme caution!)
  app.delete('/api/volumes/:repoName/force', async (req, res) => {
    try {
      const { repoName } = req.params;
      const { confirm } = req.body;
      
      if (confirm !== 'DELETE_ALL_DATA') {
        return res.status(400).json({ 
          error: 'Confirmation required', 
          message: 'Send {"confirm": "DELETE_ALL_DATA"} to confirm permanent deletion' 
        });
      }
      
      await containerService.forceCleanupRepoVolume(repoName);
      
      return res.json({ 
        message: 'Volume force cleanup completed', 
        warning: 'All uncommitted changes have been permanently deleted' 
      });
    } catch (err) {
      console.error('Volume force cleanup error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to cleanup volume';
      return res.status(500).json({ error: errorMessage });
    }
  });
  
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
