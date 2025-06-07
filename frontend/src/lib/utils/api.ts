import { browser } from '$app/environment';
import type { 
	CloneRepoResponse, 
	CompileRepoResponse, 
	FileTreeResponse, 
	FileContentResponse,
	SaveFileResponse 
} from '$types/api';

const API_URL = browser 
	? (import.meta.env.VITE_API_URL || 'http://localhost:3001')
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
}

export const apiClient = new ApiClient();
export default apiClient;