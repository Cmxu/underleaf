export interface CloneRepoRequest {
  repoUrl: string;
  userId?: string;
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

export interface ApiErrorResponse {
  error: string;
} 