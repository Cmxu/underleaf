export interface CloneRepoRequest {
  repoUrl: string;
  userId?: string;
  credentials?: {
    username: string;
    password: string;
  };
}

export interface CloneRepoResponse {
  message: string;
  path: string;
}

export interface CompileRepoRequest {
  repoName: string;
  userId?: string;
  texFile?: string;
}

export interface CompileRepoResponse {
  message: string;
  pdfFile?: string;
  pdfUrl?: string;
}

export interface FileTreeItem {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  children?: FileTreeItem[];
}

export interface FileTreeResponse {
  tree: FileTreeItem[];
}

export interface FileContentResponse {
  content: string;
}

export interface SaveFileRequest {
  filePath: string;
  content: string;
}

export interface SaveFileResponse {
  message: string;
}

export interface GitCommitRequest {
  repoName: string;
  userId?: string;
  message: string;
  author?: {
    name: string;
    email: string;
  };
}

export interface GitCommitResponse {
  message: string;
  hash: string;
}

export interface GitPushRequest {
  repoName: string;
  userId?: string;
  remote?: string;
  branch?: string;
}

export interface GitPushResponse {
  message: string;
}

export interface GitStatusRequest {
  repoName: string;
  userId?: string;
}

export interface GitStatusResponse {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  clean: boolean;
  currentBranch: string;
  tracking?: string;
}

export interface GitFetchRequest {
  repoName: string;
  userId?: string;
  remote?: string;
}

export interface GitFetchResponse {
  message: string;
}

export interface GitPullRequest {
  repoName: string;
  userId?: string;
  remote?: string;
  branch?: string;
}

export interface GitPullResponse {
  message: string;
  summary?: any;
}

export interface CreateFileRequest {
  filePath: string;
  content?: string;
}

export interface CreateFileResponse {
  message: string;
}

export interface CreateFolderRequest {
  folderPath: string;
}

export interface CreateFolderResponse {
  message: string;
}

export interface DeleteFileRequest {
  filePath: string;
}

export interface DeleteFileResponse {
  message: string;
}

export interface RenameFileRequest {
  oldPath: string;
  newPath: string;
}

export interface RenameFileResponse {
  message: string;
}

export interface ClaudeAiRequest {
  repoName: string;
  userId?: string;
  message: string;
}

export interface ClaudeAiResponse {
  message: string;
  response: string;
}

export interface ApiErrorResponse {
  error: string;
}

// Container management types
export interface UserContainerInfo {
  userId: string;
  repoName: string;
  containerId: string;
  containerName: string;
  volumeName: string;
  status: 'running' | 'stopped' | 'error';
  createdAt: Date;
  lastUsed: Date;
}

export interface RepoVolumeInfo {
  repoName: string;
  volumeName: string;
  userContainers: string[];
  createdAt: Date;
  lastUsed: Date;
}

export interface ContainerStatsResponse {
  containers: UserContainerInfo[];
  volumes: RepoVolumeInfo[];
  totalContainers: number;
  totalVolumes: number;
} 