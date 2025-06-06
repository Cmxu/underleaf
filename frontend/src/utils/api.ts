import type { CloneRepoResponse, CompileRepoResponse } from '../types/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function cloneRepo(repoUrl: string, userId = 'anonymous'): Promise<CloneRepoResponse> {
  const res = await fetch(`${API_URL}/api/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoUrl, userId }),
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || 'Failed to clone repository');
  }
  
  return res.json() as Promise<CloneRepoResponse>;
}

export async function compileRepo(
  repoName: string,
  userId = 'anonymous',
  texFile = 'main.tex'
): Promise<CompileRepoResponse> {
  const res = await fetch(`${API_URL}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoName, userId, texFile }),
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || 'Failed to compile repository');
  }
  
  return res.json() as Promise<CompileRepoResponse>;
}
