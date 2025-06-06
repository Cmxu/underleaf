const API_URL = import.meta.env.VITE_API_URL || '';

export async function cloneRepo(repoUrl: string, userId = 'anonymous') {
  const res = await fetch(`${API_URL}/api/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoUrl, userId })
  });
  if (!res.ok) {
    throw new Error('Failed to clone repository');
  }
  return res.json();
}

export async function compileRepo(repoName: string, userId = 'anonymous', texFile = 'main.tex') {
  const res = await fetch(`${API_URL}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoName, userId, texFile })
  });
  if (!res.ok) {
    throw new Error('Failed to compile repository');
  }
  return res.json();
}
