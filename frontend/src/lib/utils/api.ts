import { browser } from '$app/environment';
import type { 
	CloneRepoResponse, 
	CompileRepoResponse, 
	FileTreeResponse, 
	FileContentResponse,
	SaveFileResponse,
	GitCommitResponse,
	GitPushResponse,
	GitStatusResponse
} from '$types/api';

const API_URL = browser 
	? (import.meta.env.VITE_API_URL || '')
	: 'http://localhost:3001';

class ApiClient {
	private baseUrl: string;

	constructor(baseUrl: string = API_URL) {
		this.baseUrl = baseUrl;
	}

	private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		
		const response = await fetch(url, {
			headers: {
				'Content-Type': 'application/json',
				...options.headers
			},
			...options
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
			throw new Error(errorData.error || `Request failed with status ${response.status}`);
		}

		return response.json();
	}

	async cloneRepo(repoUrl: string, userId = 'anonymous'): Promise<CloneRepoResponse> {
		return this.request<CloneRepoResponse>('/api/clone', {
			method: 'POST',
			body: JSON.stringify({ repoUrl, userId })
		});
	}

	async compileRepo(
		repoName: string,
		userId = 'anonymous',
		texFile = 'main.tex'
	): Promise<CompileRepoResponse> {
		return this.request<CompileRepoResponse>('/api/compile', {
			method: 'POST',
			body: JSON.stringify({ repoName, userId, texFile })
		});
	}

	async getFileTree(repoName: string, userId = 'anonymous'): Promise<FileTreeResponse> {
		return this.request<FileTreeResponse>(`/api/files/${userId}/${repoName}`);
	}

	async getFileContent(
		repoName: string, 
		filePath: string, 
		userId = 'anonymous'
	): Promise<FileContentResponse> {
		const params = new URLSearchParams({ filePath });
		return this.request<FileContentResponse>(`/api/files/${userId}/${repoName}/content?${params}`);
	}

	async saveFile(
		repoName: string,
		filePath: string,
		content: string,
		userId = 'anonymous'
	): Promise<SaveFileResponse> {
		return this.request<SaveFileResponse>(`/api/files/${userId}/${repoName}/content`, {
			method: 'PUT',
			body: JSON.stringify({ filePath, content })
		});
	}

	async getGitStatus(
		repoName: string,
		userId = 'anonymous'
	): Promise<GitStatusResponse> {
		return this.request<GitStatusResponse>(`/api/git/${userId}/${repoName}/status`);
	}

	async commitChanges(
		repoName: string,
		message: string,
		userId = 'anonymous',
		author?: { name: string; email: string }
	): Promise<GitCommitResponse> {
		return this.request<GitCommitResponse>(`/api/git/${userId}/${repoName}/commit`, {
			method: 'POST',
			body: JSON.stringify({ message, author })
		});
	}

	async pushChanges(
		repoName: string,
		userId = 'anonymous',
		remote = 'origin',
		branch?: string
	): Promise<GitPushResponse> {
		const body: any = { remote };
		if (branch) {
			body.branch = branch;
		}
		return this.request<GitPushResponse>(`/api/git/${userId}/${repoName}/push`, {
			method: 'POST',
			body: JSON.stringify(body)
		});
	}
}

export const apiClient = new ApiClient();
export default apiClient;