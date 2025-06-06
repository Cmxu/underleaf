import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import simpleGit from 'simple-git';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { CloneRepoRequest, CompileRepoRequest } from './types/api';

const execAsync = promisify(exec);

const app = express();
const port = process.env.PORT || 3000;
// Base directory for cloned repositories. Each user will have a
// separate subdirectory once authentication is implemented.
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
    const { repoUrl, userId = 'anonymous' } = req.body as CloneRepoRequest;
    
    if (!repoUrl) {
      return res.status(400).json({ error: 'repoUrl is required' });
    }

    // Store repositories under a user-specific directory so that a real
    // authentication system can isolate projects in the future.
    const userPath = path.join(REPO_BASE_PATH, userId);
    const repoName = path.basename(repoUrl, '.git');
    const repoPath = path.join(userPath, repoName);

    await fs.ensureDir(userPath);
    if (await fs.pathExists(repoPath)) {
      const repoGit = simpleGit(repoPath);
      await repoGit.pull();
      return res.json({ message: 'Repository updated', path: repoPath });
    } else {
      const git = simpleGit();
      await git.clone(repoUrl, repoPath);
      
    return res.json({ message: 'Repository cloned', path: repoPath });
    }
  } catch (err) {
    console.error('Clone error:', err);
    return res.status(500).json({ error: 'Failed to clone repository' });
  }
});

app.post('/api/compile', async (req, res) => {
  try {
    const { userId = 'anonymous', repoName, texFile = 'main.tex' } = req.body as CompileRepoRequest;
    
    if (!repoName) {
      return res.status(400).json({ error: 'repoName is required' });
    }

    const repoPath = path.join(REPO_BASE_PATH, userId, repoName);
    
    // Check if the repository path exists
    if (!(await fs.pathExists(repoPath))) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    // Use the latex container to compile the document. This keeps the
    // compilation environment isolated from the Node.js process.
    const dockerCommand = `docker run --rm -v ${repoPath}:/workdir latex pdflatex ${texFile}`;

    await execAsync(dockerCommand);
    return res.json({ message: 'Compilation finished' });
  } catch (err) {
    console.error('Compile error:', err);
    return res.status(500).json({ error: 'Compilation failed' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
