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
}

export interface ApiError {
  error: string;
}
