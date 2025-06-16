import express from 'express';
import path from 'path';
import Docker from 'dockerode';
import type { 
  CloneRepoRequest, 
  CompileRepoRequest, 
  GitCommitRequest, 
  GitPushRequest,
  ClaudeAiRequest,
  ContainerStatsResponse
} from './types/api';
import { containerService } from './services/containerService';

const docker = new Docker();

const app = express();
const port = process.env.PORT || 3001;

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

    try {
      // Check if repository volume already exists
      const volumeInfo = containerService.getRepoVolumeInfo(repoName);
      
      if (volumeInfo) {
        // Repository already exists, try to update it
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
          
          // Create .claude/settings.json in the repository
          await containerService.createClaudeSettings(userId, repoName);
          
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
        
        // First, get or create the user container (this also creates the volume)
        await containerService.getOrCreateUserContainer(userId, repoName);
        
        // Setup Git credentials using custom credential helper for secure authentication
        let cloneCommand: string[];
        
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
            
          } catch (credError) {
            console.error('Failed to setup Git credentials:', credError);
            throw new Error('Failed to setup Git authentication');
          }
        }
        
        // Build git clone command with environment variables to prevent prompts
        cloneCommand = ['git', 'clone', normalizedRepoUrl, '.'];
        
        // Clone the repository inside the container
        try {
          await containerService.executeInUserContainer(userId, repoName, cloneCommand);
          
          // Create .claude/settings.json in the repository
          await containerService.createClaudeSettings(userId, repoName);
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
        return res.json({ tree: [] });
      }
      
      const fileTree = buildFileTreeFromPaths(paths);
      
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
      
      // Write file content via container using printf to avoid escape sequence interpretation
      const escapedContent = content.replace(/'/g, "'\"'\"'");
      await containerService.executeInUserContainer(
        userId, 
        repoName, 
        ['sh', '-c', `printf '%s' '${escapedContent}' > "${filePath}"`]
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

// Serve PDF files (allowing PDFs located in sub-directories as well)
// We use a wildcard parameter so everything after /pdf/ is treated as the filename/path.
app.get('/api/files/:userId/:repoName/pdf/*', async (req, res) => {
  try {
    const { userId, repoName } = req.params;
    // Express stores the wildcard match in req.params[0]
    const filename = (req.params as any)[0] as string;
    
    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    // Security check: allow sub-paths but block directory traversal or absolute paths
    // 1. Must end with .pdf  2. Must not contain ".."  3. Must not start with a slash
    if (!filename.endsWith('.pdf') || filename.includes('..') || filename.startsWith('/')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    try {
      // Ensure user's container is running
      await containerService.getOrCreateUserContainer(userId, repoName);
      
      // Check if PDF file exists
      try {
        await containerService.executeInUserContainer(userId, repoName, ['test', '-f', filename]);
      } catch {
        return res.status(404).json({ error: 'PDF file not found' });
      }
      
      // Get PDF file size
      const { stdout: sizeOutput } = await containerService.executeInUserContainer(
        userId, 
        repoName, 
        ['stat', '-c', '%s', filename]
      );
      
      const fileSize = parseInt(sizeOutput.trim()) || 0;
      
      if (fileSize === 0) {
        return res.status(404).json({ error: 'PDF file is empty' });
      }
      
      // Verify it's actually a PDF file by reading the header
      const { stdout: headerCheck } = await containerService.executeInUserContainer(
        userId, 
        repoName, 
        ['head', '-c', '4', filename]
      );
      
      if (!headerCheck.startsWith('%PDF')) {
        return res.status(400).json({ error: 'File is not a valid PDF' });
      }
      
      // Set appropriate headers for PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', fileSize.toString());
      // Use only the base name for the suggested download filename
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filename)}"`);
      // NOTE: We deliberately omit the "Accept-Ranges" header here because
      // the server does *not* implement HTTP range requests. Advertising
      // range support without actually honouring Range headers confuses
      // pdf.js and results in an empty-document (0 pages) rendering in the
      // viewer.
      res.setHeader('Cache-Control', 'no-cache');
      
            // Use Docker's native file extraction API for reliability
      const container = await containerService.getOrCreateUserContainer(userId, repoName);
      const dockerContainer = docker.getContainer(container.containerId);
      
      // Get file as tar stream from container
      const tarStream = await dockerContainer.getArchive({
        path: `/workdir/${filename}`
      });
      
      // Extract PDF from tar stream and send directly to response
      const tar = require('tar-stream');
      const extract = tar.extract();
      
      let pdfBuffer = Buffer.alloc(0);
      let pdfFound = false;
      
      extract.on('entry', (header: any, stream: any, next: any) => {
        if (header.name === filename || header.name.endsWith(filename)) {
          pdfFound = true;
          console.log(`Extracting PDF: ${header.name}, size: ${header.size}`);
          
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          
          stream.on('end', () => {
            pdfBuffer = Buffer.concat(chunks);
            
            // Verify buffer size matches the stat size we got earlier
            if (pdfBuffer.length !== fileSize) {
              console.warn(`Size mismatch: expected ${fileSize}, got ${pdfBuffer.length}`);
              // Don't fail on minor size differences, just log warning
            }
            
            // Final verification - check PDF header
            if (!pdfBuffer.toString('ascii', 0, 4).startsWith('%PDF')) {
              return res.status(500).json({ error: 'Invalid PDF data extracted from container' });
            }
            
            // Send the PDF buffer
            res.send(pdfBuffer);
            next();
          });
          
          stream.on('error', (streamError: Error) => {
            console.error('PDF stream error:', streamError);
            if (!res.headersSent) {
              res.status(500).json({ error: 'Error reading PDF from container' });
            }
            next();
          });
        } else {
          stream.on('end', next);
          stream.resume(); // Skip other files
        }
      });
      
      extract.on('finish', () => {
        if (!pdfFound && !res.headersSent) {
          return res.status(404).json({ error: 'PDF file not found in container archive' });
        }
      });
      
      extract.on('error', (extractError: Error) => {
        console.error('PDF extraction error:', extractError);
        if (!res.headersSent) {
          return res.status(500).json({ error: 'Failed to extract PDF from container archive' });
        }
      });
      
      tarStream.pipe(extract);
      
    } catch (containerError) {
      console.error('Container PDF serve error:', containerError);
      const errorMessage = containerError instanceof Error ? containerError.message : 'Unknown error';
      
      // Provide more specific error information for debugging
      let debugInfo = '';
      if (errorMessage.includes('hexdump') || errorMessage.includes('xxd') || errorMessage.includes('od')) {
        debugInfo = ' (Binary data extraction tool not available in container)';
      } else if (errorMessage.includes('No such file')) {
        debugInfo = ' (PDF file or temp file not found)';
      } else if (errorMessage.includes('Permission denied')) {
        debugInfo = ' (File permission issue)';
      }
      
      return res.status(500).json({ 
        error: 'Failed to serve PDF from container', 
        details: errorMessage + debugInfo,
        filename: filename 
      });
    }
    
  } catch (err) {
    console.error('PDF serve error:', err);
    return res.status(500).json({ error: 'Failed to serve PDF file' });
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
        await compileWithPdflatex(repoPath, texFile);
    } else {
      throw new Error('pdflatex not available');
    }
  } catch (error) {
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
    
    
    try {
      // Ensure user's container is running
      await containerService.getOrCreateUserContainer(userId, repoName);
      
      // Check if the tex file exists via container
      let actualTexFile = texFile;
      try {
        await containerService.executeInUserContainer(userId, repoName, ['test', '-f', texFile]);
      } catch {
        
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
          actualTexFile = foundFile;
        } else {
          // Create a simple LaTeX file for demo via container
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
            ['sh', '-c', `printf '%s' '${escapedContent}' > "${texFile}"`]
          );
          
          // Compile the demo file
          try {
            await containerService.executeInUserContainer(
              userId, 
              repoName, 
              ['latexmk', '-pdf', '-interaction=nonstopmode', '-output-directory=.', texFile]
            );
          } catch (latexmkError) {
            // Fall back to pdflatex if latexmk is not available
            console.log('latexmk not available for demo, using pdflatex');
            await containerService.executeInUserContainer(
              userId, 
              repoName, 
              ['pdflatex', '-interaction=nonstopmode', '-output-directory=.', texFile]
            );
          }
          
          const pdfFile = texFile.replace('.tex', '.pdf');
          return res.json({ 
            message: 'Demo PDF created (no LaTeX files found in repository)',
            pdfFile: pdfFile,
            pdfUrl: `/api/files/${userId}/${repoName}/pdf/${pdfFile}`
          });
        }
      }
      
      // Use containerized LaTeX compilation for each user
      let stdout = '';
      let stderr = '';
      
      try {
        // Try latexmk first (preferred for handling bibliography and multiple passes)
        const result = await containerService.executeInUserContainer(
          userId, 
          repoName, 
          ['latexmk', '-pdf', '-interaction=nonstopmode', '-output-directory=.', actualTexFile]
        );
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (latexmkError) {
        // If latexmk is not available, fall back to manual pdflatex with bibliography handling
        console.log('latexmk not available, falling back to pdflatex with manual bibliography handling');
        
        // First pass: pdflatex
        let result = await containerService.executeInUserContainer(
          userId, 
          repoName, 
          ['pdflatex', '-interaction=nonstopmode', '-output-directory=.', actualTexFile]
        );
        stdout += result.stdout;
        stderr += result.stderr;
        
        // Check if we have bibliography files (.bib) and run bibtex if needed
        try {
          const bibFiles = await containerService.executeInUserContainer(
            userId, 
            repoName, 
            ['find', '.', '-name', '*.bib', '-type', 'f']
          );
          
          if (bibFiles.stdout.trim()) {
            console.log('Bibliography files found, running bibtex');
            // Run bibtex on the aux file
            const auxFile = actualTexFile.replace('.tex', '.aux');
            try {
              const bibtexResult = await containerService.executeInUserContainer(
                userId, 
                repoName, 
                ['bibtex', auxFile]
              );
              stdout += bibtexResult.stdout;
              stderr += bibtexResult.stderr;
              
              // Second pass: pdflatex (to incorporate bibliography)
              result = await containerService.executeInUserContainer(
                userId, 
                repoName, 
                ['pdflatex', '-interaction=nonstopmode', '-output-directory=.', actualTexFile]
              );
              stdout += result.stdout;
              stderr += result.stderr;
              
              // Third pass: pdflatex (to resolve all references)
              result = await containerService.executeInUserContainer(
                userId, 
                repoName, 
                ['pdflatex', '-interaction=nonstopmode', '-output-directory=.', actualTexFile]
              );
              stdout += result.stdout;
              stderr += result.stderr;
            } catch (bibtexError) {
              console.log('bibtex failed, continuing with single pdflatex pass');
            }
          }
        } catch (findError) {
          console.log('Could not check for bibliography files, continuing with single pass');
        }
      }
      
      if (stderr && !stdout) {
        console.warn('LaTeX compilation warnings/errors:', stderr);
      }
      
      const pdfFile = actualTexFile.replace('.tex', '.pdf');
      
      // Check if PDF was created via container
      try {
        await containerService.executeInUserContainer(userId, repoName, ['test', '-f', pdfFile]);
        
        // Add a sync delay to ensure the PDF file is fully written to disk
        // LaTeX compilation can take time to flush buffers properly
        console.log('PDF file exists, waiting for filesystem sync...');
        await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 second delay
        
        // Sync filesystem to ensure all data is written
        try {
          await containerService.executeInUserContainer(userId, repoName, ['sync']);
        } catch (syncError) {
          console.warn('sync command not available, using fsync fallback:', syncError);
          // Alternative: just add a small delay for buffer flushing
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Get file size via container
        const { stdout: sizeOutput } = await containerService.executeInUserContainer(
          userId, 
          repoName, 
          ['stat', '-c', '%s', pdfFile]
        );
        const fileSize = parseInt(sizeOutput.trim()) || 0;
        
        // Reject empty or corrupt output early so the frontend shows a clear error
        if (fileSize === 0) {
          throw new Error('PDF file is empty – LaTeX compilation probably failed');
        }
        
        // Verify the PDF header to make sure we return a *real* PDF and not a
        // zero-byte placeholder produced by a failed compilation.
        const { stdout: headerCheck } = await containerService.executeInUserContainer(
          userId, 
          repoName, 
          ['head', '-c', '4', pdfFile]
        );
        
        if (!headerCheck.startsWith('%PDF')) {
          throw new Error('Invalid PDF generated – the file does not start with %PDF');
        }
        
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

// Claude AI interactive setup endpoint
app.post('/api/claude/interactive-setup', async (req, res) => {
  try {
    const { userId = 'anonymous', repoName } = req.body;
    
    if (!repoName) {
      return res.status(400).json({ error: 'repoName is required' });
    }

    
    try {
      // Re-use the already running user container instead of launching a new one
      const userContainerInfo = await containerService.getOrCreateUserContainer(userId, repoName);
      const tempContainerName = userContainerInfo.containerName; // keep the same var name for minimal downstream edits
      const tempContainer = docker.getContainer(userContainerInfo.containerId);

      // Prepare the expect script content
      const expectScript = `#!/usr/bin/expect -f
# claude_autostart.exp
#
# Launches \`claude\`, chooses the default text style,
# then chooses the default login method by pressing <Enter> twice.
# Uses Ctrl-Z to background the process after getting the URL.

set timeout 60           ;# 60 second timeout

# 1. Start the programme
spawn claude

# 2. Wait for the "text style" prompt and accept the default
expect {
    -re {Choose the text style that looks best with your terminal:} {
        send "\\r"
    }
    -re {text style.*:} {
        send "\\r"
    }
    timeout {
        puts "Timeout waiting for text style prompt"
        exit 1
    }
}

# 3. Wait for the "login method" prompt and accept the default
expect {
    -re {Select login method:} {
        send "\\r"
    }
    -re {login method.*:} {
        send "\\r"
    }
    -re {authentication.*:} {
        send "\\r"
    }
    timeout {
        puts "Timeout waiting for login method prompt"
        exit 1
    }
}

# 4. Wait for and capture the authentication URL, then background the process
expect {
    -re {Browser didn't open\\? Use the url below to sign in: (https?://[^\\s\\r\\n\\x1b\\x00-\\x1f]+)} {
        puts "AUTH_URL_FOUND: $expect_out(1,string)"
        puts "DEBUG: Found browser message with URL: $expect_out(1,string)"
        puts "WAITING_FOR_CODE"
        
        # Send Ctrl-Z to background the claude process
        # puts "DEBUG: Sending Ctrl-Z to background claude process"
        # send "\\032"
        
        # Wait a moment for the process to be backgrounded
        after 1000
        
        # Now we wait for the verification code file
        puts "DEBUG: Claude process backgrounded, waiting for verification code file"
    }
    -re {Use the url below to sign in: (https?://[^\\s\\r\\n\\x1b\\x00-\\x1f]+)} {
        puts "AUTH_URL_FOUND: $expect_out(1,string)"
        puts "DEBUG: Found sign in URL: $expect_out(1,string)"
        puts "WAITING_FOR_CODE"
        
        # Send Ctrl-Z to background the claude process
        # puts "DEBUG: Sending Ctrl-Z to background claude process"
        # send "\\032"
        
        # Wait a moment for the process to be backgrounded
        after 1000
        
        # Now we wait for the verification code file
        puts "DEBUG: Claude process backgrounded, waiting for verification code file"
    }
    -re {(https?://[^\\s\\r\\n\\x1b\\x00-\\x1f]+)} {
        puts "AUTH_URL_FOUND: $expect_out(1,string)"
        puts "DEBUG: Found standalone URL: $expect_out(1,string)"
        puts "WAITING_FOR_CODE"
        
        # Send Ctrl-Z to background the claude process
        # puts "DEBUG: Sending Ctrl-Z to background claude process"
        # send "\\032"
        # Wait a moment for the process to be backgrounded
        after 1000
        
        # Now we wait for the verification code file
        puts "DEBUG: Claude process backgrounded, waiting for verification code file"
    }
    -re {Paste code here if prompted >|Enter the verification code|verification code|Enter code|code:} {
        puts "CODE_PROMPT_READY"
        puts "DEBUG: Found code prompt directly, no need to background"
        puts "WAITING_FOR_USER_INPUT"
    }
    -re {already.*authenticated} {
        puts "ALREADY_AUTHENTICATED"
        exit 0
    }
    -re {error|failed|invalid} {
        puts "SETUP_ERROR"
        exit 1
    }
    timeout {
        puts "DEBUG: Timeout waiting for URL or code prompt"
        puts "DEBUG: Buffer content: $expect_out(buffer)"
        exit 1
    }
    eof {
        puts "DEBUG: Process ended unexpectedly"
        exit 1
    }
}

# 5. Wait for the verification code file to appear
set timeout 300  ;# 5 minute timeout for user to provide code
set verification_code ""

puts "DEBUG: Starting to poll for verification code file"
puts "DEBUG: Looking for file at: /tmp/claude-comm/verification_code.txt"

# Check if the mount directory exists
if {[file exists "/tmp/claude-comm"]} {
    puts "DEBUG: Mount directory /tmp/claude-comm exists"
    catch {exec ls -la /tmp/claude-comm} result
    puts "DEBUG: Directory contents: $result"
} else {
    puts "DEBUG: Mount directory /tmp/claude-comm does not exist!"
}

for {set i 0} {$i < 300} {incr i} {
    # Debug output every 10 seconds
    if {$i % 10 == 0} {
        puts "DEBUG: Polling attempt $i/300"
        if {[file exists "/tmp/claude-comm"]} {
            catch {exec ls -la /tmp/claude-comm 2>/dev/null} ls_result
            puts "DEBUG: Directory contents: $ls_result"
        }
    }
    
    # Check if file exists and try to read it
    if {[file exists "/tmp/claude-comm/verification_code.txt"]} {
        puts "DEBUG: Found verification_code.txt file"
        
        # Check if file is readable
        if {[file readable "/tmp/claude-comm/verification_code.txt"]} {
            puts "DEBUG: File is readable, attempting to read content"
            
            # Try to read the verification code from file
            if {[catch {open "/tmp/claude-comm/verification_code.txt" r} file_handle]} {
                puts "DEBUG: Failed to open file: $file_handle"
                after 500
                continue
            }
            
            set verification_code [string trim [read $file_handle]]
            close $file_handle
            
            puts "DEBUG: Successfully read verification code"
            puts "DEBUG: Code length: [string length $verification_code]"
            
            # Delete the file to avoid reuse
            catch {file delete "/tmp/claude-comm/verification_code.txt"}
            
            if {[string length $verification_code] > 0} {
                puts "CODE_RECEIVED: $verification_code"
                
                # Bring claude back to foreground and submit the code
                puts "DEBUG: Bringing claude process back to foreground"
                #send "fg\\r"
              
                
                # Now send the verification code character by character like real keystrokes
                puts "DEBUG: Sending verification code to claude character by character"
                
                # Type the code like real keystrokes

                foreach ch [split $verification_code ""] {
                    send -- $ch
                    after 50
                }
                send "\\r"
                puts "CODE_SUBMITTED: $verification_code"
                puts "DEBUG: OTP sent"
                
                break
            } else {
                puts "DEBUG: File was empty, continuing to poll"
            }
        } else {
            puts "DEBUG: File exists but is not readable"
            catch {exec chmod 666 /tmp/claude-comm/verification_code.txt}
        }
    }
    
    # Sleep for 1 second before checking again
    after 200
}

if {$verification_code eq ""} {
    puts "TIMEOUT_WAITING_FOR_CODE_FILE"
    puts "DEBUG: Timeout waiting for verification code file"
    exit 1
}

# 6. Wait for authentication completion flow after submitting the code
set timeout 60

# First, wait for "Login successful. Press Enter to continue…"
expect {
    -re {successful} {
        puts "DEBUG: Login successful, pressing Enter to continue"
        send "\\r"
    }
    -re {error|failed|invalid|incorrect} {
        puts "CODE_ERROR"
        exit 1
    }
    timeout {
        puts "DEBUG: Timeout waiting for login successful message"
        puts "DEBUG: Current buffer content:"
        puts $expect_out(buffer)
        exit 1
    }
    eof {
        puts "DEBUG: Process ended unexpectedly after code submission"
        exit 1
    }
}

# Wait for "Security notes:" then press enter
expect {
    -re {Security notes} {
        puts "DEBUG: Found Security notes prompt, pressing Enter"
        send "\\r"
    }
    timeout {
        puts "DEBUG: Timeout waiting for Security notes"
        puts "DEBUG: Current buffer content:"
        puts $expect_out(buffer)
        exit 1
    }
    eof {
        puts "DEBUG: Process ended at Security notes"
        exit 1
    }
}

# Wait for "Do you trust the files in this folder?" then press enter
expect {
    -re {Do you trust.*files.*folder} {
        puts "DEBUG: Found trust files prompt, pressing Enter"
        send "\\r"
    }
    -re {trust.*files} {
        puts "DEBUG: Found trust files prompt (alternate pattern), pressing Enter"
        send "\\r"
    }
    timeout {
        puts "DEBUG: Timeout waiting for trust files prompt"
        puts "DEBUG: Current buffer content:"
        puts $expect_out(buffer)
        exit 1
    }
    eof {
        puts "DEBUG: Process ended at trust files prompt"
        exit 1
    }
}

# Finally, send Ctrl-C twice to finish
puts "DEBUG: Authentication flow complete, sending Ctrl-C twice"
send "\\003"
after 500
send "\\003"
after 1000

puts "AUTHENTICATION_SUCCESS"
puts "DEBUG: Claude authentication setup completed successfully"
exit 0
`;

      console.log(`Using existing container ${tempContainerName} for Claude setup`);

      // Ensure required tooling and directories exist inside the container
      await containerService.executeInUserContainer(userId, repoName, [
        'sh', '-c', 'command -v expect || (apt-get update -qq && apt-get install -y -qq expect)'
      ]);

      await containerService.executeInUserContainer(userId, repoName, [
        'mkdir', '-p', '/tmp/claude-comm'
      ]);

      await containerService.executeInUserContainer(userId, repoName, [
        'chmod', '777', '/tmp/claude-comm'
      ]);

      // Copy the expect script into the container
      await containerService.executeInUserContainer(userId, repoName, [
        'sh', '-c', `cat > /tmp/claude_setup.exp << 'EOF'\n${expectScript.replace(/'/g, "'\\''")}\nEOF`
      ]);
      await containerService.executeInUserContainer(userId, repoName, [
        'chmod', '+x', '/tmp/claude_setup.exp'
      ]);

      // Start the expect script and get a live stream to it
      const execInstance = await tempContainer.exec({
        Cmd: ['/tmp/claude_setup.exp'],
        AttachStdout: true,
        AttachStderr: true,
        AttachStdin: true,
        Tty: true
      });

      const containerStream = await execInstance.start({ hijack: true, stdin: true });

      // tempCommDir is purely internal now
      const tempCommDir = '/tmp/claude-comm';

      let outputBuffer = '';
      let authUrl = '';
      let responseAlreadySent = false;

      // Timeout to avoid hanging forever waiting for user interaction
      const timeout = setTimeout(() => {
        if (!responseAlreadySent) {
          responseAlreadySent = true;
          res.status(500).json({ error: 'Claude setup timeout after 5 minutes' });
        }
      }, 300000); // 5-minute timeout for user interaction

      // Attach to the container for real-time interaction
      containerStream.on('data', (chunk) => {
        const data = chunk.toString();
        outputBuffer += data;
        
        console.log('=== Claude setup output ===');
        console.log(data);
        console.log('=== End Claude setup output ===');
        
        // Look for specific markers in the output
        if (data.includes('AUTH_URL_FOUND:')) {
          console.log('🔍 AUTH_URL_FOUND marker detected!');
          const urlMatch = data.match(/AUTH_URL_FOUND:\s*(https?:\/\/[^\s\r\n]+)/);
          if (urlMatch) {
            authUrl = urlMatch[1].trim();
            console.log('🔗 CLAUDE AUTH URL FOUND:', authUrl);
            console.log('🔗 URL LENGTH:', authUrl.length);
            console.log('🔗 RAW DATA CONTAINING URL:', JSON.stringify(data));
            
            // Respond immediately when we have the URL - don't wait for WAITING_FOR_CODE
            if (!responseAlreadySent) {
              console.log('✅ URL found, responding to frontend immediately');
              respondWithUrl();
            }
          } else {
            console.log('❌ AUTH_URL_FOUND marker found but regex failed to extract URL');
            console.log('🔍 Full data for debugging:', JSON.stringify(data));
          }
        }
        
        // Also check if there's a URL anywhere in the output (fallback)
        if (!authUrl && !responseAlreadySent) {
          const urlMatch = data.match(/https?:\/\/[^\s\r\n\x1b\x00-\x1f]+/);
          if (urlMatch) {
            authUrl = urlMatch[0].trim();
            if (!responseAlreadySent) {
              respondWithUrl();
            }
          }
        }
        
        // Also check for the old flow - if we see WAITING_FOR_CODE with a URL
        if (data.includes('WAITING_FOR_CODE') && authUrl && !responseAlreadySent) {
          respondWithUrl();
        }
        
        function respondWithUrl() {
          responseAlreadySent = true;
          clearTimeout(timeout);
          
          // Store container info for later code submission with multiple keys for reliability
          (global as any).claudeContainers = (global as any).claudeContainers || {};
          const containerInfo = {
            container: tempContainer,
            stream: containerStream,
            containerName: tempContainerName,
            tempCommDir,
            userId,
            repoName,
            authUrl,
            createdAt: new Date().toISOString()
          };
          
          // Store with multiple key formats to ensure retrieval works
          const sessionId = `${userId}-${repoName}`;
          (global as any).claudeContainers[sessionId] = containerInfo;
          (global as any).claudeContainers[tempContainerName] = containerInfo;
          
          
          // Add a verification that the container info is actually stored
          setTimeout(() => {
            const storedInfo = (global as any).claudeContainers[sessionId];
            if (storedInfo) {
            }
          }, 1000);
          
          res.json({
            message: 'Claude Pro authentication URL captured',
            authUrl,
            step: 'waiting_for_code',
            instructions: [
              '1. Click the authentication URL',
              '2. Sign in with your Claude Pro account', 
              '3. Copy the verification code you receive',
              '4. Enter the code in the popup to complete setup'
            ],
            output: outputBuffer,
            needsUserCode: true,
            sessionId: `${userId}-${repoName}`
          });
        }
        
        // Handle authentication completion
        if (data.includes('AUTHENTICATION_SUCCESS') && !responseAlreadySent) {
          responseAlreadySent = true;
          clearTimeout(timeout);
          
          // No host-side cleanup required when reusing container
          
          res.json({
            message: 'Claude authentication completed successfully!',
            step: 'completed',
            configured: true
          });
        }
        
        if (data.includes('ALREADY_AUTHENTICATED') && !responseAlreadySent) {
          responseAlreadySent = true;
          clearTimeout(timeout);
          
          // No host-side cleanup required when reusing container
          
          res.json({
            message: 'Claude CLI is already configured',
            step: 'already_configured',
            configured: true
          });
        }
      });

      // This fallback is no longer needed since we handle responses in the stream handler
      // The container stays alive waiting for user code input
      
    } catch (containerError) {
      console.error('Container claude interactive setup error:', containerError);
      return res.status(500).json({ error: 'Failed to run Claude interactive setup in container' });
    }
    
  } catch (err) {
    console.error('Claude interactive setup endpoint error:', err);
    return res.status(500).json({ error: 'Failed to start Claude interactive setup' });
  }
  });

// DEBUG: Test endpoint to verify routing works
app.post('/api/claude/test', (req, res) => {
  res.json({ message: 'Test endpoint working', body: req.body });
});

// Claude AI code verification endpoint
app.post('/api/claude/verify-code', async (req, res) => {
  try {
    const { userId = 'anonymous', repoName, verificationCode } = req.body;
    
    if (!repoName || !verificationCode) {
      return res.status(400).json({ error: 'repoName and verificationCode are required' });
    }

    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    try {
      // Get the container for file writing
      console.log('🔍 Looking for container for verification code submission...');
      const writeSessionId = `${userId}-${repoName}`;
      const writeContainerInfo = (global as any).claudeContainers?.[writeSessionId];
      
      let container;
      if (writeContainerInfo && writeContainerInfo.container) {
        console.log('✅ Using existing Claude container from session');
        container = writeContainerInfo.container;
      } else {
        console.log('🔄 Getting or creating user container via container service');
        const userContainerInfo = await containerService.getOrCreateUserContainer(userId, repoName);
        container = docker.getContainer(userContainerInfo.containerId);
        console.log('✅ Got container:', userContainerInfo.containerName);
      }
      
      // Write the verification code to the container
      const cleanCode = verificationCode.trim();
      console.log('📝 Writing verification code to container:', cleanCode.length, 'characters');
      
      // Escape the verification code for safe shell usage
      const escapedCode = cleanCode.replace(/'/g, "'\"'\"'");
      
      // Create directory and write file in separate steps for better error handling
      try {
        // Step 1: Create directory
        const mkdirExec = await container.exec({
          Cmd: ['mkdir', '-p', '/tmp/claude-comm'],
          AttachStdout: true,
          AttachStderr: true
        });
        
        const mkdirStream = await mkdirExec.start({ hijack: true, stdin: false });
        let mkdirOutput = '';
        mkdirStream.on('data', (chunk: Buffer) => {
          mkdirOutput += chunk.toString();
        });
        
        await new Promise((resolve, reject) => {
          mkdirStream.on('end', resolve);
          mkdirStream.on('error', reject);
        });
        
        console.log('📁 Directory creation output:', mkdirOutput || '(no output)');
        
        // Step 2: Write the verification code file
        const writeExec = await container.exec({
          Cmd: ['sh', '-c', `echo '${escapedCode}' > /tmp/claude-comm/verification_code.txt`],
          AttachStdout: true,
          AttachStderr: true
        });
        
        const writeStream = await writeExec.start({ hijack: true, stdin: false });
        let writeOutput = '';
        writeStream.on('data', (chunk: Buffer) => {
          writeOutput += chunk.toString();
        });
        
        await new Promise((resolve, reject) => {
          writeStream.on('end', resolve);
          writeStream.on('error', reject);
        });
        
        console.log('✍️ File write output:', writeOutput || '(no output)');
        
        // Step 3: Set permissions
        const chmodExec = await container.exec({
          Cmd: ['chmod', '666', '/tmp/claude-comm/verification_code.txt'],
          AttachStdout: true,
          AttachStderr: true
        });
        
        const chmodStream = await chmodExec.start({ hijack: true, stdin: false });
        let chmodOutput = '';
        chmodStream.on('data', (chunk: Buffer) => {
          chmodOutput += chunk.toString();
        });
        
        await new Promise((resolve, reject) => {
          chmodStream.on('end', resolve);
          chmodStream.on('error', reject);
        });
        
        console.log('🔐 Permissions set output:', chmodOutput || '(no output)');
        
        // Small delay to ensure file operations complete
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Step 4: Verify the file was written correctly
        const verifyExec = await container.exec({
          Cmd: ['cat', '/tmp/claude-comm/verification_code.txt'],
          AttachStdout: true,
          AttachStderr: true
        });
        
        const verifyStream = await verifyExec.start({ hijack: true, stdin: false });
        let verifyOutput = '';
        verifyStream.on('data', (chunk: Buffer) => {
          verifyOutput += chunk.toString();
        });
        
        await new Promise((resolve, reject) => {
          verifyStream.on('end', resolve);
          verifyStream.on('error', reject);
        });
        
        console.log('🔍 File verification - expected length:', cleanCode.length, 'actual length:', verifyOutput.trim().length);
        console.log('🔍 File content matches:', verifyOutput.trim() === cleanCode);
        
        // The expect script inside the container may consume and delete the verification
        // file almost immediately after we create it. In that case `cat` will return an
        // empty result or "No such file" and the content check above will fail. This is
        // perfectly fine – the presence of the file for even a split-second is enough
        // for the script to read the code and proceed. Therefore, instead of treating a
        // mismatch as a hard error, we only log a warning and continue waiting for the
        // authentication success markers.
        if (!verifyOutput.trim() || verifyOutput.trim() !== cleanCode) {
          console.warn('⚠️  Verification file could not be validated – it was probably picked up by the expect script already. Continuing to monitor authentication…');
        } else {
          console.log('✅ Verification code file created successfully');
        }
        
      } catch (fileError) {
        console.error('❌ File operation failed:', fileError);
        return res.status(500).json({ error: 'Failed to create verification code file - ' + (fileError instanceof Error ? fileError.message : 'unknown error') });
      }
      
      // Monitor container stream for authentication completion
      let responseAlreadySent = false;
      let authTimeout: NodeJS.Timeout | null = null;
      
      // Cleanup function to clear all timeouts and listeners
      const cleanup = (storedInfo?: any) => {
        if (authTimeout) {
          clearTimeout(authTimeout);
          authTimeout = null;
        }
        if (storedInfo?.stream && streamDataHandler) {
          storedInfo.stream.removeListener('data', streamDataHandler);
        }
      };
      
      // Single timeout for authentication process
      authTimeout = setTimeout(() => {
        if (!responseAlreadySent) {
          responseAlreadySent = true;
          cleanup();
          res.status(500).json({ error: 'Authentication timeout - no response from Claude CLI after 90 seconds' });
        }
      }, 90000); // Extended to 90 seconds
      
      const sessionId = `${userId}-${repoName}`;
      const storedContainerInfo = (global as any).claudeContainers?.[sessionId];
      
      // Declare streamDataHandler in scope for cleanup function
      let streamDataHandler: ((data: Buffer) => void) | null = null;
      
      if (storedContainerInfo && storedContainerInfo.stream) {
        streamDataHandler = (data: Buffer) => {
          const outputText = data.toString();
          
          // Check for success markers
          if ((outputText.includes('AUTHENTICATION_SUCCESS') || 
               outputText.includes('UAUTHENTICATION_SUCCESS') || 
               outputText.includes('authentication setup completed successfully')) && 
              !responseAlreadySent) {
            
            responseAlreadySent = true;
            cleanup(storedContainerInfo);
            
            res.json({
              message: 'Claude authentication completed successfully!',
              step: 'completed',
              configured: true
            });
            return;
          }
          
          // Check for error markers
          if ((outputText.includes('SETUP_ERROR') || 
               outputText.includes('CODE_ERROR') || 
               outputText.includes('invalid') || 
               outputText.includes('incorrect') || 
               outputText.includes('failed')) && 
              !responseAlreadySent) {
            
            responseAlreadySent = true;
            cleanup(storedContainerInfo);
            
            res.json({
              message: 'Invalid verification code',
              step: 'code_error',
              error: 'The verification code was incorrect. Please try again.'
            });
            return;
          }
        };
        
        // Add the listener to the existing stream
        storedContainerInfo.stream.on('data', streamDataHandler);
        
      } else {
        // Fallback to log polling if no stream is available
        const pollInterval = 2000;
        
        const pollLogs = async () => {
          if (responseAlreadySent) return;
          
          try {
            const logs = await container.logs({
              stdout: true,
              stderr: true,
              tail: 100,
              since: Math.floor((Date.now() / 1000) - 120)
            });
            
            const logData = logs.toString();
            
            if (logData.includes('AUTHENTICATION_SUCCESS') || 
                logData.includes('UAUTHENTICATION_SUCCESS') || 
                logData.includes('authentication setup completed successfully') ||
                logData.includes('success') || 
                logData.includes('authenticated') || 
                logData.includes('complete') ||
                logData.includes('ready')) {
              
              responseAlreadySent = true;
              cleanup();
              
              res.json({
                message: 'Claude authentication completed successfully!',
                step: 'completed',
                configured: true
              });
              return;
            }
            
            if (logData.includes('SETUP_ERROR') || 
                logData.includes('CODE_ERROR') || 
                logData.includes('invalid') || 
                logData.includes('incorrect') || 
                logData.includes('failed')) {
              
              responseAlreadySent = true;
              cleanup();
              
              res.json({
                message: 'Invalid verification code',
                step: 'code_error',
                error: 'The verification code was incorrect. Please try again.'
              });
              return;
            }
            
            if (!responseAlreadySent) {
              setTimeout(pollLogs, pollInterval);
            }
            
          } catch (logError) {
            if (!responseAlreadySent) {
              setTimeout(pollLogs, pollInterval);
            }
          }
        };
        
        // Start polling after 1 second
        setTimeout(pollLogs, 1000);
      }
      
    } catch (containerError) {
      console.error('❌ Container operation failed:', containerError);
      const errorMessage = containerError instanceof Error ? containerError.message : 'Unknown container error';
      return res.status(500).json({ error: 'Failed to write verification code to container: ' + errorMessage });
    }
    
  } catch (err) {
    return res.status(500).json({ error: 'Failed to process code verification' });
  }
});

// Session storage for multi-turn conversations
const claudeSessions = new Map<string, string>(); // key: userId:repoName, value: sessionId

// Claude AI endpoint with streaming support
app.post('/api/claude', async (req, res) => {
  try {
    const { userId = 'anonymous', repoName, message } = req.body as ClaudeAiRequest;
    
    if (!repoName || !message) {
      return res.status(400).json({ error: 'repoName and message are required' });
    }

    const sessionKey = `${userId}:${repoName}`;
    const existingSessionId = claudeSessions.get(sessionKey);

    // Check if repository volume exists
    const volumeInfo = containerService.getRepoVolumeInfo(repoName);
    if (!volumeInfo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    try {
      // Set up environment variables for Claude CLI if API key is available
      const claudeEnv = process.env.ANTHROPIC_API_KEY ? 
        ['ANTHROPIC_API_KEY=' + process.env.ANTHROPIC_API_KEY] : [];
      
      // First, check if Claude is authenticated to avoid triggering auth flow
      try {
        const { stdout: authCheck } = await containerService.executeInUserContainer(
          userId,
          repoName,
          ['claude', 'auth', 'whoami'],
          undefined,
          claudeEnv
        );
        
        if (!authCheck || authCheck.includes('not authenticated') || authCheck.includes('no valid')) {
          return res.status(401).json({ 
            error: 'Claude CLI not authenticated. Please complete authentication first.',
            requiresAuth: true
          });
        }
      } catch (authError) {
        return res.status(401).json({ 
          error: 'Claude CLI not authenticated. Please complete authentication first.',
          requiresAuth: true
        });
      }
      
      // Set up streaming response headers
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      });

      // Get container for streaming execution
      const userContainerInfo = await containerService.getOrCreateUserContainer(userId, repoName);
      const container = docker.getContainer(userContainerInfo.containerId);

      // Build Claude command with optional session resume and MCP configuration
      const claudeCmd = ['claude', '--print', '--verbose', '--output-format', 'stream-json'];
      
      // Add MCP configuration if .claude/settings.json exists
      try {
        const settingsExist = await containerService.checkClaudeSettings(userId, repoName);
        if (settingsExist) {
          claudeCmd.push('--mcp-config', '.claude/settings.json');
          claudeCmd.push('--permission-prompt-tool', 'mcp__underleaf_permissions__permission_prompt');
          console.log('🔧 Using MCP configuration with permission prompt tool');
        }
      } catch (error) {
        console.warn('Failed to check Claude settings:', error);
      }
      
      if (existingSessionId) {
        claudeCmd.push('--resume', existingSessionId);
        console.log(`🔄 Resuming Claude session: ${existingSessionId}`);
      } else {
        console.log('🆕 Starting new Claude session');
      }
      claudeCmd.push(message);

      // Create exec instance for streaming Claude command
      const execInstance = await container.exec({
        Cmd: claudeCmd,
        AttachStdout: true,
        AttachStderr: true,
        AttachStdin: false,
        Tty: false,
        Env: claudeEnv
      });

      const stream = await execInstance.start({ hijack: true, stdin: false });
      
      let buffer = '';
      let hasStarted = false;
      let capturedSessionId: string | null = null;

      stream.on('data', (chunk) => {
        console.log('🔍 Raw chunk received, length:', chunk.length);
        
        // Handle Docker multiplexed stream format
        let offset = 0;
        while (offset < chunk.length) {
          // Docker stream format: [stream_type, 0, 0, 0, size1, size2, size3, size4, data...]
          if (offset + 8 > chunk.length) {
            // Not enough data for a complete header, save for next chunk
            break;
          }
          
          const streamType = chunk[offset]; // 1=stdout, 2=stderr
          const size = chunk.readUInt32BE(offset + 4); // Read size as big-endian uint32
          
          console.log(`📦 Docker stream - type: ${streamType}, size: ${size}`);
          
          if (offset + 8 + size > chunk.length) {
            // Not enough data for complete message, save for next chunk
            break;
          }
          
          // Extract the actual data
          const data = chunk.subarray(offset + 8, offset + 8 + size).toString();
          console.log('📝 Extracted data:', JSON.stringify(data));
          
          buffer += data;
          offset += 8 + size;
        }
        
        // Process complete lines from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            console.log('📋 Processing line:', trimmedLine);
            
            try {
              const jsonData = JSON.parse(trimmedLine);
              console.log('✅ Parsed JSON type:', jsonData.type, 'data:', jsonData);
              
              // Capture session ID for multi-turn conversations
              if (jsonData.session_id && !capturedSessionId) {
                capturedSessionId = jsonData.session_id;
                console.log(`📝 Captured session ID: ${capturedSessionId}`);
              }
              
              // Handle different Claude CLI output formats
              if (jsonData.type === 'assistant' && jsonData.message?.content) {
                // Assistant message format - this is the main content
                const content = jsonData.message.content;
                if (Array.isArray(content)) {
                  for (const item of content) {
                    if (item.type === 'text' && item.text) {
                      console.log('📤 Sending assistant text:', item.text);
                      res.write(item.text + '\n\n'); // Add double line break between messages
                      hasStarted = true;
                      break; // Only send the first text item to avoid duplicates
                    } else if (item.type === 'tool_use') {
                      // Handle tool use blocks
                      console.log('🔧 Tool use detected:', item.name, 'with input:', item.input);
                      // Send structured tool call data that frontend can parse
                      const toolCallData = {
                        type: 'tool_call',
                        name: item.name,
                        id: item.id,
                        arguments: item.input || {}
                      };
                      const toolCallMessage = `\n__TOOL_CALL_START__${JSON.stringify(toolCallData)}__TOOL_CALL_END__\n`;
                      console.log('📤 Sending tool call to frontend:', toolCallMessage);
                      res.write(toolCallMessage);
                      hasStarted = true;
                    }
                  }
                }
              } else if (jsonData.type === 'tool_use' && jsonData.name) {
                // Direct tool use format
                console.log('🔧 Direct tool use detected:', jsonData.name, 'with input:', jsonData.input);
                const toolCallData = {
                  type: 'tool_call',
                  name: jsonData.name,
                  id: jsonData.id,
                  arguments: jsonData.input || {}
                };
                const toolCallMessage = `\n__TOOL_CALL_START__${JSON.stringify(toolCallData)}__TOOL_CALL_END__\n`;
                console.log('📤 Sending direct tool call to frontend:', toolCallMessage);
                res.write(toolCallMessage);
                hasStarted = true;
              } else if (jsonData.type === 'result' && jsonData.result) {
                // Result format - this is the final complete message, only send if no assistant message was sent
                if (!hasStarted) {
                  console.log('📤 Sending result text:', jsonData.result);
                  res.write(jsonData.result + '\n\n'); // Add double line break between messages
                  hasStarted = true;
                } else {
                  console.log('ℹ️ Skipping result message as assistant message already sent');
      }
              } else if (jsonData.type === 'content_block_delta' && jsonData.delta?.text) {
                // Streaming delta format
                console.log('📤 Sending delta text:', jsonData.delta.text);
                res.write(jsonData.delta.text);
                hasStarted = true;
              } else if (jsonData.type === 'message_stop') {
                console.log('🛑 Message stop received');
                res.end();
                return;
              } else if (jsonData.type === 'error') {
                console.log('❌ Error in stream:', jsonData.error);
                if (!hasStarted) {
                  res.write(`Error: ${jsonData.error?.message || 'Unknown error'}`);
                }
                res.end();
                return;
              } else {
                console.log('ℹ️ Other JSON type:', jsonData.type);
              }
            } catch (parseError) {
              console.log('⚠️ JSON parse failed, treating as text:', trimmedLine);
              // If it's not JSON, treat as plain text (but filter out debug info)
              if (trimmedLine && 
                  !trimmedLine.includes('INFO') && 
                  !trimmedLine.includes('DEBUG') &&
                  !trimmedLine.includes('session_id') &&
                  trimmedLine.length < 1000) { // Avoid super long lines that might be corrupted
                res.write(trimmedLine + '\n');
                hasStarted = true;
              }
            }
          }
        }
      });

      stream.on('end', () => {
        console.log('🏁 Stream ended, buffer:', JSON.stringify(buffer));
        
        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const jsonData = JSON.parse(buffer.trim());
            if (jsonData.type === 'content_block_delta' && jsonData.delta?.text) {
              res.write(jsonData.delta.text);
              hasStarted = true;
            }
          } catch (parseError) {
            const trimmedBuffer = buffer.trim();
            if (trimmedBuffer && !trimmedBuffer.includes('{') && !trimmedBuffer.includes('INFO') && !trimmedBuffer.includes('DEBUG')) {
              res.write(trimmedBuffer);
              hasStarted = true;
            }
          }
        }
        
        if (!hasStarted) {
          console.log('❌ No content was streamed, ending with error message');
          res.write('No response from Claude. Please check authentication and try again.');
        } else {
          console.log('✅ Stream completed successfully');
        }

        // Store session ID for future conversations
        if (capturedSessionId) {
          claudeSessions.set(sessionKey, capturedSessionId);
          console.log(`💾 Stored session ID ${capturedSessionId} for ${sessionKey}`);
        }

        res.end();
      });

      stream.on('error', (error) => {
        console.error('❌ Stream error:', error);
        if (!hasStarted) {
          res.write(`Stream error: ${error.message}`);
        }
        if (!res.headersSent) {
          res.end();
        }
      });

      // Handle client disconnect
      req.on('close', () => {
        stream.destroy();
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

  // Clear Claude session endpoint
  app.delete('/api/claude/session/:userId/:repoName', async (req, res) => {
    try {
      const { userId, repoName } = req.params;
      const sessionKey = `${userId}:${repoName}`;
      
      if (claudeSessions.has(sessionKey)) {
        const sessionId = claudeSessions.get(sessionKey);
        claudeSessions.delete(sessionKey);
        console.log(`🗑️ Cleared Claude session ${sessionId} for ${sessionKey}`);
        return res.json({ message: 'Session cleared successfully', sessionId });
      } else {
        return res.json({ message: 'No active session found' });
      }
    } catch (err) {
      console.error('Clear session error:', err);
      return res.status(500).json({ error: 'Failed to clear session' });
    }
  });

  // Command execution endpoint
  app.post('/api/execute-command', async (req, res) => {
    try {
      const { userId = 'anonymous', repoName, command } = req.body;
      
      if (!repoName || !command) {
        return res.status(400).json({ error: 'repoName and command are required' });
      }

      // Check if repository volume exists
      const volumeInfo = containerService.getRepoVolumeInfo(repoName);
      if (!volumeInfo) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      // Security: Prevent dangerous commands
      const dangerousCommands = ['rm -rf /', 'sudo', 'passwd', 'su -', 'chmod 777', 'shutdown', 'reboot', 'mkfs', 'fdisk'];
      const lowerCommand = command.toLowerCase();
      if (dangerousCommands.some(dangerous => lowerCommand.includes(dangerous))) {
        return res.status(403).json({ 
          error: 'Command not allowed for security reasons',
          command: command
        });
      }

      try {
        // Execute command in user container
        const startTime = Date.now();
        const { stdout, stderr } = await containerService.executeInUserContainer(
          userId,
          repoName,
          ['bash', '-c', command]
        );
        const duration = Date.now() - startTime;

        console.log(`📋 Command executed: ${command} (${duration}ms)`);
        
        return res.json({
          success: true,
          command,
          stdout: stdout || '',
          stderr: stderr || '',
          duration,
          timestamp: new Date().toISOString()
        });
      } catch (containerError) {
        console.error('Container command execution error:', containerError);
        const errorMessage = containerError instanceof Error ? containerError.message : 'Unknown error';
        
        return res.json({
          success: false,
          command,
          stdout: '',
          stderr: errorMessage,
          duration: 0,
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Command execution endpoint error:', err);
      return res.status(500).json({ error: 'Failed to execute command' });
    }
  });

  // Permission prompt endpoints
  
  // Get pending permission prompts
  app.get('/api/claude/permissions/:userId/:repoName', async (req, res) => {
    try {
      const { userId, repoName } = req.params;
      
      // Check if repository volume exists
      const volumeInfo = containerService.getRepoVolumeInfo(repoName);
      if (!volumeInfo) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      try {
        // Read permission prompts from the container
        const { stdout } = await containerService.executeInUserContainer(
          userId,
          repoName,
          ['sh', '-c', 'ls /tmp/claude-comm/permission_*.json 2>/dev/null || echo ""']
        );

        const prompts = [];
        if (stdout.trim()) {
          const files = stdout.trim().split('\n');
          for (const file of files) {
            if (file.trim()) {
              try {
                const { stdout: content } = await containerService.executeInUserContainer(
                  userId,
                  repoName,
                  ['cat', file]
                );
                const promptData = JSON.parse(content);
                prompts.push(promptData);
              } catch (error) {
                console.warn('Failed to read permission prompt file:', file, error);
              }
            }
          }
        }

        return res.json({ prompts });
      } catch (containerError) {
        console.error('Container permission prompts check error:', containerError);
        return res.status(500).json({ error: 'Failed to check permission prompts in container' });
      }
    } catch (err) {
      console.error('Permission prompts endpoint error:', err);
      return res.status(500).json({ error: 'Failed to get permission prompts' });
    }
  });

  // Respond to a permission prompt
  app.post('/api/claude/permissions/:userId/:repoName/respond', async (req, res) => {
    try {
      const { userId, repoName } = req.params;
      const { promptId, approved, reason } = req.body;
      
      if (!promptId || typeof approved !== 'boolean') {
        return res.status(400).json({ error: 'promptId and approved (boolean) are required' });
      }

      // Check if repository volume exists
      const volumeInfo = containerService.getRepoVolumeInfo(repoName);
      if (!volumeInfo) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      try {
        // Create response data
        const responseData = {
          promptId,
          approved,
          reason: reason || '',
          timestamp: new Date().toISOString(),
        };

        // Write response to container
        const responseJson = JSON.stringify(responseData, null, 2);
        await containerService.executeInUserContainer(
          userId,
          repoName,
          ['sh', '-c', `mkdir -p /tmp/claude-comm && cat > /tmp/claude-comm/response_${promptId}.json << 'EOF'\n${responseJson}\nEOF`]
        );

        // Remove the original prompt file
        await containerService.executeInUserContainer(
          userId,
          repoName,
          ['rm', '-f', `/tmp/claude-comm/permission_${promptId}.json`]
        ).catch(() => {}); // Ignore errors if file doesn't exist

        console.log(`📝 Permission response recorded: ${promptId} - ${approved ? 'APPROVED' : 'DENIED'}`);
        
        return res.json({ 
          message: 'Permission response recorded',
          promptId,
          approved,
          reason 
        });
      } catch (containerError) {
        console.error('Container permission response error:', containerError);
        return res.status(500).json({ error: 'Failed to record permission response in container' });
      }
    } catch (err) {
      console.error('Permission response endpoint error:', err);
      return res.status(500).json({ error: 'Failed to record permission response' });
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
  
  // Global error handler
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Global error:', error.message);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
