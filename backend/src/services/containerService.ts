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
   * Get or create a container for a user
   */
  async getOrCreateUserContainer(userId: string, repoName: string): Promise<UserContainer> {
    const containerKey = `${userId}-${repoName}`;
    
    // Check if container already exists and is running
    if (this.containers.has(containerKey)) {
      const container = this.containers.get(containerKey)!;
      
      // Update last used time
      container.lastUsed = new Date();
      
      // Check if container is still running
      try {
        const dockerContainer = docker.getContainer(container.containerId);
        const info = await dockerContainer.inspect();
        
        if (info.State.Running) {
          return container;
        }
        
        // Container exists but not running, restart it
        await dockerContainer.start();
        container.status = 'running';
        return container;
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
    const settingsContent = {
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