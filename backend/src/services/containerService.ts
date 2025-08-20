import Docker from 'dockerode';

const docker = new Docker();

interface UserContainer {
  userId: string;
  repoName: string;
  containerId: string;
  containerName: string;
  volumeName: string;
  status: 'running' | 'stopped' | 'error';
  createdAt: Date;
  lastUsed: Date;
}

interface RepoVolume {
  repoName: string;
  volumeName: string;
  userContainers: string[]; // Container IDs using this volume
  createdAt: Date;
  lastUsed: Date;
}

class ContainerService {
  private containers: Map<string, UserContainer> = new Map();
  private repoVolumes: Map<string, RepoVolume> = new Map();
  private readonly CONTAINER_PREFIX = 'underleaf-user';
  private readonly VOLUME_PREFIX = 'underleaf-repo';
  private readonly LATEX_IMAGE = 'underleaf-latex:latest';
  private readonly NETWORK_NAME = 'underleaf_web';
  private readonly CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_IDLE_TIME = 60 * 60 * 1000; // 1 hour

  constructor() {
    // Start cleanup process
    this.startCleanupProcess();
    // Load existing containers on startup
    this.loadExistingContainers();
  }

  /**
   * Check if container needs to be recreated due to image changes
   */
  private async shouldRecreateContainer(containerId: string): Promise<boolean> {
    try {
      const dockerContainer = docker.getContainer(containerId);
      const info = await dockerContainer.inspect();
      const currentImageId = info.Image;
      
      // Get the current image ID for underleaf-latex:latest
      const images = await docker.listImages({ filters: { reference: ['underleaf-latex:latest'] } });
      if (images.length > 0) {
        const latestImageId = images[0].Id;
        return currentImageId !== latestImageId;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to check if container needs recreation:', error);
      return false;
    }
  }

  /**
   * Get or create a container for a user
   */
  async getOrCreateUserContainer(userId: string, repoName: string): Promise<UserContainer> {
    const containerKey = `${userId}-${repoName}`;
    
    // Check if container already exists and is running
    if (this.containers.has(containerKey)) {
      const container = this.containers.get(containerKey)!;
      
      // Update last used time
      container.lastUsed = new Date();
      
      // Check if container is still running and doesn't need recreation
      try {
        const dockerContainer = docker.getContainer(container.containerId);
        const info = await dockerContainer.inspect();
        
        if (info.State.Running) {
          // Check if container needs to be recreated due to image changes
          if (await this.shouldRecreateContainer(container.containerId)) {
            console.log(`Container ${container.containerName} needs recreation due to image changes`);
            await this.removeUserContainer(userId, repoName);
            // Continue to create new container
          } else {
            return container;
          }
        } else {
          // Container exists but not running, restart it
          await dockerContainer.start();
          container.status = 'running';
          return container;
        }
      } catch (error) {
        // Container doesn't exist anymore, remove from our map
        this.containers.delete(containerKey);
      }
    }

    // Create new container
    return await this.createUserContainer(userId, repoName);
  }

  /**
   * Get or create a repository volume
   */
  private async getOrCreateRepoVolume(repoName: string): Promise<RepoVolume> {
    if (this.repoVolumes.has(repoName)) {
      const volume = this.repoVolumes.get(repoName)!;
      volume.lastUsed = new Date();
      return volume;
    }

    const volumeName = `${this.VOLUME_PREFIX}-${repoName}`;
    
    try {
      // Check if volume already exists
      try {
        await docker.getVolume(volumeName).inspect();
        console.log(`Volume ${volumeName} already exists`);
      } catch {
        // Create new volume
        await docker.createVolume({
          Name: volumeName,
          Labels: {
            'underleaf.repo': repoName,
            'underleaf.type': 'repository'
          }
        });
        console.log(`Created volume ${volumeName} for repository ${repoName}`);
      }

      const repoVolume: RepoVolume = {
        repoName,
        volumeName,
        userContainers: [],
        createdAt: new Date(),
        lastUsed: new Date()
      };

      this.repoVolumes.set(repoName, repoVolume);
      return repoVolume;

    } catch (error) {
      console.error(`Failed to create volume for repository ${repoName}:`, error);
      throw new Error(`Failed to create repository volume: ${error}`);
    }
  }

  /**
   * Initialize repository data in volume from host if needed
   */
  private async initializeRepoVolume(repoName: string): Promise<void> {
    const volumeName = `${this.VOLUME_PREFIX}-${repoName}`;

    try {
      // Check if volume is empty by running a temporary container
      const tempContainer = await docker.createContainer({
        Image: this.LATEX_IMAGE,
        Cmd: ['sh', '-c', 'ls -la /workdir | wc -l'],
        HostConfig: {
          Mounts: [{
            Target: '/workdir',
            Source: volumeName,
            Type: 'volume'
          }],
          AutoRemove: true
        }
      });

      const stream = await tempContainer.attach({
        stream: true,
        stdout: true,
        stderr: true
      });

      await tempContainer.start();
      await tempContainer.wait();

      let output = '';
      stream.on('data', (chunk) => {
        output += chunk.toString();
      });

      await new Promise((resolve) => {
        stream.on('end', resolve);
      });

      // If volume is empty (only . and .. entries = 2 lines), it will be initialized during git clone
      const lineCount = parseInt(output.trim().split('\n')[0]) || 0;
      
      if (lineCount <= 2) {
        console.log(`Volume ${volumeName} is empty - will be initialized during git clone operation`);
      } else {
        console.log(`Volume ${volumeName} already contains data (${lineCount} entries)`);
      }

    } catch (error) {
      console.error(`Failed to check repository volume ${volumeName}:`, error);
      // Continue anyway - volume might already have data or will be created
    }
  }

  /**
   * Create a new container for a user
   */
  private async createUserContainer(userId: string, repoName: string): Promise<UserContainer> {
    const containerKey = `${userId}-${repoName}`;
    const containerName = `${this.CONTAINER_PREFIX}-${userId}-${repoName}`;

    try {
      // Get or create repository volume
      const repoVolume = await this.getOrCreateRepoVolume(repoName);
      
      // Initialize volume with repository data if needed
      await this.initializeRepoVolume(repoName);

      // Create container
      const container = await docker.createContainer({
        Image: this.LATEX_IMAGE,
        name: containerName,
        WorkingDir: '/workdir',
        Cmd: ['tail', '-f', '/dev/null'], // Keep container running
        HostConfig: {
          Mounts: [{
            Target: '/workdir',
            Source: repoVolume.volumeName,
            Type: 'volume'
          }],
          NetworkMode: this.NETWORK_NAME,
          AutoRemove: false,
          RestartPolicy: {
            Name: 'unless-stopped'
          }
        },
        Labels: {
          'traefik.enable': 'false', // LaTeX containers don't need HTTP routing
          'underleaf.user': userId,
          'underleaf.repo': repoName,
          'underleaf.volume': repoVolume.volumeName,
          'underleaf.type': 'latex'
        }
      });

      // Start container
      await container.start();

      const userContainer: UserContainer = {
        userId,
        repoName,
        containerId: container.id,
        containerName,
        volumeName: repoVolume.volumeName,
        status: 'running',
        createdAt: new Date(),
        lastUsed: new Date()
      };

      this.containers.set(containerKey, userContainer);
      
      // Add container to repo volume tracking
      repoVolume.userContainers.push(container.id);
      
      console.log(`Created container ${containerName} for user ${userId} using volume ${repoVolume.volumeName}`);
      return userContainer;

    } catch (error) {
      console.error(`Failed to create container for user ${userId}:`, error);
      throw new Error(`Failed to create user container: ${error}`);
    }
  }

  /**
   * Create .claude/settings.json file in the repository
   */
  async createClaudeSettings(userId: string, repoName: string): Promise<void> {
    // First, try to create a basic configuration without MCP to avoid startup errors
    const basicSettingsContent = {
      "includeCoAuthoredBy": false,
      "permissions": {
        "allow": [
          "Bash",
          "Edit",
          "MultiEdit",
          "NotebookEdit",
          "WebFetch",
          "WebSearch",
          "Write"
        ]
      }
    };

    // Advanced configuration with MCP (only if MCP server is available)
    const advancedSettingsContent = {
      "includeCoAuthoredBy": false,
      "permissions": {
        "allow": [
          "Bash",
          "Edit",
          "MultiEdit",
          "NotebookEdit",
          "WebFetch",
          "WebSearch",
          "Write",
          "mcp__underleaf_permissions__permission_prompt",
          "mcp__underleaf_permissions__wait_for_permission",
          "mcp__latex_compile__compile_latex",
          "mcp__latex_compile__check_latex_syntax",
          "mcp__latex_compile__get_latex_log",
          "mcp__latex_compile__clean_latex_build",
          "mcp__underleaf_comments__list_comments",
          "mcp__underleaf_comments__read_comment",
          "mcp__underleaf_comments__write_comment",
          "mcp__underleaf_comments__update_comment",
          "mcp__underleaf_comments__delete_comment"
        ]
      },
      "mcpServers": {
        "underleaf_permissions": {
          "command": "node",
          "args": ["/usr/local/bin/permission-prompt-server.js"]
        },
        "latex_compile": {
          "command": "node",
          "args": ["/usr/local/bin/latex-compile-server.js"]
        },
        "underleaf_comments": {
          "command": "node",
          "args": ["/usr/local/bin/comments-server.js"]
        }
      }
    };

    // Check if MCP dependencies are available
    let useMcp = false;
    let missingDependencies: string[] = [];
    
    try {
      // Check if MCP server files exist
      const mcpFiles = [
        '/usr/local/bin/permission-prompt-server.js',
        '/usr/local/bin/latex-compile-server.js',
        '/usr/local/bin/comments-server.js'
      ];
      
      for (const file of mcpFiles) {
        try {
          await this.executeInUserContainer(userId, repoName, ['test', '-f', file]);
        } catch (error) {
          missingDependencies.push(file);
        }
      }
      
      // Check if node is available
      try {
        await this.executeInUserContainer(userId, repoName, ['which', 'node']);
      } catch (error) {
        missingDependencies.push('node');
      }
      
      if (missingDependencies.length === 0) {
        useMcp = true;
        console.log(`MCP dependencies available for ${userId}/${repoName}, using advanced configuration`);
      } else {
        console.log(`MCP dependencies missing for ${userId}/${repoName}:`, missingDependencies.join(', '));
        console.log('Using basic configuration without MCP features');
      }
    } catch (error) {
      console.log(`Failed to check MCP dependencies for ${userId}/${repoName}:`, error);
      console.log('Using basic configuration without MCP features');
    }

    const settingsContent = useMcp ? advancedSettingsContent : basicSettingsContent;

    try {
      // Create .claude directory
      await this.executeInUserContainer(userId, repoName, ['mkdir', '-p', '.claude']);
      
      // Create settings.json file using heredoc for better shell escaping
      const settingsJson = JSON.stringify(settingsContent, null, 2);
      await this.executeInUserContainer(userId, repoName, ['sh', '-c', `cat > .claude/settings.json << 'EOF'\n${settingsJson}\nEOF`]);
      
      console.log(`Created .claude/settings.json for ${userId}/${repoName}`);
    } catch (error) {
      console.error(`Failed to create .claude/settings.json for ${userId}/${repoName}:`, error);
      // Don't throw error - this is not critical for repository functionality
    }
  }

  /**
   * Check if .claude/settings.json exists in the repository
   */
  async checkClaudeSettings(userId: string, repoName: string): Promise<boolean> {
    try {
      await this.executeInUserContainer(userId, repoName, ['test', '-f', '.claude/settings.json']);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get project settings for a repository
   */
  async getProjectSettings(userId: string, repoName: string): Promise<any> {
    try {
      // Check if settings file exists
      await this.executeInUserContainer(userId, repoName, ['test', '-f', '.underleaf/settings.json']);
      
      // Read existing settings
      const { stdout: content } = await this.executeInUserContainer(
        userId, repoName, ['cat', '.underleaf/settings.json']
      );
      
      return JSON.parse(content);
    } catch (error) {
      // Return default settings if file doesn't exist
      return {
        mainDocument: await this.detectMainDocument(userId, repoName),
        compileOptions: {
          engine: 'pdflatex',
          outputDirectory: 'build'
        },
        version: '1.0'
      };
    }
  }

  /**
   * Save project settings for a repository
   */
  async saveProjectSettings(userId: string, repoName: string, settings: any): Promise<void> {
    try {
      // Create .underleaf directory
      await this.executeInUserContainer(userId, repoName, ['mkdir', '-p', '.underleaf']);
      
      // Save settings file
      const settingsJson = JSON.stringify(settings, null, 2);
      await this.executeInUserContainer(userId, repoName, ['sh', '-c', `cat > .underleaf/settings.json << 'EOF'\n${settingsJson}\nEOF`]);
      
      console.log(`Saved project settings for ${userId}/${repoName}`);
    } catch (error) {
      console.error(`Failed to save project settings for ${userId}/${repoName}:`, error);
      throw error;
    }
  }

  /**
   * Auto-detect the main document in a repository
   */
  async detectMainDocument(userId: string, repoName: string): Promise<string | null> {
    const commonMainFiles = [
      'main.tex',
      'paper.tex',
      'document.tex',
      'thesis.tex',
      'report.tex',
      'article.tex',
      'book.tex',
      'index.tex'
    ];

    try {
      // Check for common main file names
      for (const filename of commonMainFiles) {
        try {
          await this.executeInUserContainer(userId, repoName, ['test', '-f', filename]);
          console.log(`Detected main document: ${filename}`);
          return filename;
        } catch (error) {
          // File doesn't exist, continue checking
        }
      }

      // If no common names found, look for .tex files with \documentclass
      try {
        const { stdout: texFiles } = await this.executeInUserContainer(
          userId, repoName, ['find', '.', '-name', '*.tex', '-type', 'f']
        );

        if (texFiles.trim()) {
          const files = texFiles.trim().split('\n');
          
          for (const file of files) {
            if (file.trim()) {
              try {
                // Check if file contains \documentclass (indicates it's a main document)
                await this.executeInUserContainer(
                  userId, repoName, ['grep', '-l', '\\documentclass', file.trim()]
                );
                
                                 const mainFile = file.replace(/^\.\//, ''); // Remove ./ prefix
                console.log(`Detected main document with \\documentclass: ${mainFile}`);
                return mainFile;
              } catch (error) {
                // File doesn't contain \documentclass, continue checking
              }
            }
          }
        }
      } catch (error) {
        console.log('No .tex files found for main document detection');
      }

      // Fallback: return the first .tex file found
      try {
        const { stdout: firstTex } = await this.executeInUserContainer(
          userId, repoName, ['find', '.', '-name', '*.tex', '-type', 'f', '|', 'head', '-1']
        );
        
        if (firstTex.trim()) {
                     const mainFile = firstTex.trim().replace(/^\.\//, '');
          console.log(`Fallback main document: ${mainFile}`);
          return mainFile;
        }
      } catch (error) {
        console.log('No .tex files found in repository');
      }

      return null;
    } catch (error) {
      console.error(`Failed to detect main document for ${userId}/${repoName}:`, error);
      return null;
    }
  }

  /**
   * Execute a command in a user's container with optional stdin input and environment variables
   */
  async executeInUserContainer(userId: string, repoName: string, command: string[], stdin?: string, extraEnv?: string[]): Promise<{ stdout: string; stderr: string }> {
    const container = await this.getOrCreateUserContainer(userId, repoName);
    
    try {
      const dockerContainer = docker.getContainer(container.containerId);
      
      const exec = await dockerContainer.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
        AttachStdin: !!stdin,
        WorkingDir: '/workdir',
        Env: [
          'GIT_TERMINAL_PROMPT=0',  // Disable Git terminal prompts
          'GIT_ASKPASS=',           // Disable Git askpass
          'SSH_ASKPASS=',           // Disable SSH askpass
          'DISPLAY=',               // Disable GUI prompts
          ...(extraEnv || [])       // Add any extra environment variables
        ]
      });

      const stream = await exec.start({ hijack: true, stdin: !!stdin });

      return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        // Write stdin data if provided
        if (stdin) {
          stream.write(stdin);
          stream.end();
        }

        stream.on('data', (chunk) => {
          const data = chunk.toString();
          // Docker multiplexes stdout and stderr, first byte indicates stream type
          if (chunk[0] === 1) {
            stdout += data.slice(8); // Remove header
          } else if (chunk[0] === 2) {
            stderr += data.slice(8); // Remove header
          }
        });

        stream.on('end', async () => {
          try {
            // Check the exit code of the executed command
            const inspectResult = await exec.inspect();
            const exitCode = inspectResult.ExitCode;
            
            if (exitCode !== 0) {
              // Mask credentials in command logging
              const maskedCommand = command.map(arg => 
                arg.includes('@') && arg.includes('://') ? arg.replace(/:\/\/[^@]+@/, '://***:***@') : arg
              );
              console.error(`Command failed with exit code ${exitCode}:`, maskedCommand);
              console.error('STDOUT:', stdout);
              console.error('STDERR:', stderr);
              reject(new Error(`Command failed with exit code ${exitCode}: ${stderr || stdout || 'Unknown error'}`));
            } else {
              resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
            }
          } catch (inspectError) {
            console.error('Failed to inspect command execution:', inspectError);
            // Fall back to original behavior if inspect fails
            resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
          }
        });

        stream.on('error', reject);
      });

    } catch (error) {
      console.error(`Failed to execute command in container ${container.containerName}:`, error);
      throw new Error(`Container execution failed: ${error}`);
    }
  }

  /**
   * Stop and remove a user's container
   */
  async removeUserContainer(userId: string, repoName: string): Promise<void> {
    const containerKey = `${userId}-${repoName}`;
    const container = this.containers.get(containerKey);

    if (!container) {
      return;
    }

    try {
      const dockerContainer = docker.getContainer(container.containerId);
      
      // Stop container
      await dockerContainer.stop({ t: 10 });
      
      // Remove container
      await dockerContainer.remove();
      
      this.containers.delete(containerKey);
      
      // Update volume tracking
      const repoVolume = this.repoVolumes.get(repoName);
      if (repoVolume) {
        repoVolume.userContainers = repoVolume.userContainers.filter(id => id !== container.containerId);
        
        // Volume persists even with no active containers to preserve uncommitted changes
        if (repoVolume.userContainers.length === 0) {
          console.log(`Volume ${repoVolume.volumeName} has no active containers (volume preserved for data persistence)`);
        }
      }
      
      console.log(`Removed container ${container.containerName}`);
    } catch (error) {
      console.error(`Failed to remove container ${container.containerName}:`, error);
      // Remove from our map even if removal failed
      this.containers.delete(containerKey);
    }
  }

  /**
   * Force recreation of all containers (useful after image updates)
   */
  async forceRecreateAllContainers(): Promise<void> {
    console.log('Forcing recreation of all containers due to image update...');
    
    const containersToRemove = Array.from(this.containers.keys());
    
    for (const containerKey of containersToRemove) {
      const [userId, repoName] = containerKey.split('-', 2);
      await this.removeUserContainer(userId, repoName);
    }
    
    console.log(`Recreated ${containersToRemove.length} containers with updated image`);
  }

  /**
   * Get container stats for a user
   */
  async getUserContainerInfo(userId: string, repoName: string): Promise<UserContainer | null> {
    const containerKey = `${userId}-${repoName}`;
    return this.containers.get(containerKey) || null;
  }

  /**
   * List all user containers
   */
  getAllUserContainers(): UserContainer[] {
    return Array.from(this.containers.values());
  }

  /**
   * Get all repository volumes
   */
  getAllRepoVolumes(): RepoVolume[] {
    return Array.from(this.repoVolumes.values());
  }

  /**
   * Get containers for a specific repository
   */
  getContainersForRepo(repoName: string): UserContainer[] {
    return Array.from(this.containers.values()).filter(container => container.repoName === repoName);
  }

  /**
   * Get volume information for a repository
   */
  getRepoVolumeInfo(repoName: string): RepoVolume | null {
    return this.repoVolumes.get(repoName) || null;
  }

  /**
   * Manual cleanup of a repository volume (administrative use only)
   * WARNING: This will permanently delete all uncommitted changes!
   */
  async forceCleanupRepoVolume(repoName: string): Promise<void> {
    const volume = this.repoVolumes.get(repoName);
    if (!volume) {
      throw new Error(`Volume for repository ${repoName} not found`);
    }

    // Ensure no containers are using this volume
    if (volume.userContainers.length > 0) {
      throw new Error(`Cannot cleanup volume ${volume.volumeName}: ${volume.userContainers.length} containers are still using it`);
    }

    try {
      // Remove the Docker volume
      const dockerVolume = docker.getVolume(volume.volumeName);
      await dockerVolume.remove();
      
      // Remove from our tracking
      this.repoVolumes.delete(repoName);
      
      console.log(`FORCE CLEANUP: Removed repository volume: ${volume.volumeName}`);
    } catch (error) {
      console.error(`Failed to force cleanup volume ${volume.volumeName}:`, error);
      throw new Error(`Failed to cleanup volume: ${error}`);
    }
  }

  /**
   * Load existing containers on startup
   */
  private async loadExistingContainers(): Promise<void> {
    try {
      const containers = await docker.listContainers({
        all: true,
        filters: {
          label: ['underleaf.type=latex']
        }
      });

      for (const containerInfo of containers) {
        const labels = containerInfo.Labels || {};
        const userId = labels['underleaf.user'];
        const repoName = labels['underleaf.repo'];

        if (userId && repoName) {
          const containerKey = `${userId}-${repoName}`;
          const volumeName = labels['underleaf.volume'] || `${this.VOLUME_PREFIX}-${repoName}`;
          
          const userContainer: UserContainer = {
            userId,
            repoName,
            containerId: containerInfo.Id,
            containerName: containerInfo.Names[0].replace('/', ''),
            volumeName,
            status: containerInfo.State === 'running' ? 'running' : 'stopped',
            createdAt: new Date(containerInfo.Created * 1000),
            lastUsed: new Date()
          };

          this.containers.set(containerKey, userContainer);
          
          // Track volume usage
          if (!this.repoVolumes.has(repoName)) {
            this.repoVolumes.set(repoName, {
              repoName,
              volumeName,
              userContainers: [containerInfo.Id],
              createdAt: new Date(containerInfo.Created * 1000),
              lastUsed: new Date()
            });
          } else {
            const volume = this.repoVolumes.get(repoName)!;
            if (!volume.userContainers.includes(containerInfo.Id)) {
              volume.userContainers.push(containerInfo.Id);
            }
          }
        }
      }

      console.log(`Loaded ${this.containers.size} existing user containers`);
    } catch (error) {
      console.error('Failed to load existing containers:', error);
    }
  }

  /**
   * Cleanup idle containers
   */
  private startCleanupProcess(): void {
    setInterval(async () => {
      const now = new Date();
      const containersToRemove: string[] = [];

      for (const [key, container] of this.containers) {
        const idleTime = now.getTime() - container.lastUsed.getTime();
        
        if (idleTime > this.MAX_IDLE_TIME) {
          containersToRemove.push(key);
        }
      }

      // Remove idle containers
      for (const key of containersToRemove) {
        const container = this.containers.get(key);
        if (container) {
          console.log(`Cleaning up idle container: ${container.containerName}`);
          const [userId, repoName] = key.split('-', 2);
          await this.removeUserContainer(userId, repoName);
        }
      }

      if (containersToRemove.length > 0) {
        console.log(`Cleaned up ${containersToRemove.length} idle containers`);
      }

      // Note: Repository volumes are kept persistent to preserve uncommitted changes
      // Volumes will persist across container restarts and user sessions
    }, this.CLEANUP_INTERVAL);
  }
}

export const containerService = new ContainerService(); 