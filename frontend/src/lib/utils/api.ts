import { browser } from '$app/environment';
import type {
	CloneRepoRequest,
	CloneRepoResponse,
	CompileRepoRequest,
	CompileRepoResponse,
	FileTreeResponse,
	FileContentResponse,
	SaveFileRequest,
	SaveFileResponse,
	CreateFileRequest,
	CreateFileResponse,
	CreateFolderResponse,
	DeleteFileResponse,
	RenameFileResponse,
	GitCommitResponse,
	GitPushResponse,
	GitStatusResponse,
	GitFetchResponse,
	GitPullResponse,
	ClaudeAiRequest,
	ClaudeAiResponse
} from '$types/api';

const API_URL = browser ? import.meta.env.VITE_API_URL || 'http://localhost:3001' : 'http://localhost:3001';

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

	async cloneRepo(repoUrl: string, userId = 'anonymous', credentials?: { username: string; password: string }): Promise<CloneRepoResponse> {
		return this.request<CloneRepoResponse>('/api/clone', {
			method: 'POST',
			body: JSON.stringify({ repoUrl, userId, credentials })
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

	async checkRepoExists(repoName: string, userId = 'anonymous'): Promise<boolean> {
		try {
			await this.getFileTree(repoName, userId);
			return true;
		} catch (error) {
			return false;
		}
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

	async getGitStatus(repoName: string, userId = 'anonymous'): Promise<GitStatusResponse> {
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
		const body: { remote: string; branch?: string } = { remote };
		if (branch) {
			body.branch = branch;
		}
		return this.request<GitPushResponse>(`/api/git/${userId}/${repoName}/push`, {
			method: 'POST',
			body: JSON.stringify(body)
		});
	}

	async fetchChanges(
		repoName: string,
		userId = 'anonymous',
		remote = 'origin'
	): Promise<GitFetchResponse> {
		return this.request<GitFetchResponse>(`/api/git/${userId}/${repoName}/fetch`, {
			method: 'POST',
			body: JSON.stringify({ remote })
		});
	}

	async pullChanges(
		repoName: string,
		userId = 'anonymous',
		remote = 'origin',
		branch?: string
	): Promise<GitPullResponse> {
		const body: { remote: string; branch?: string } = { remote };
		if (branch) {
			body.branch = branch;
		}
		return this.request<GitPullResponse>(`/api/git/${userId}/${repoName}/pull`, {
			method: 'POST',
			body: JSON.stringify(body)
		});
	}

	async createFile(
		repoName: string,
		filePath: string,
		content = '',
		userId = 'anonymous'
	): Promise<CreateFileResponse> {
		return this.request<CreateFileResponse>(`/api/files/${userId}/${repoName}/create-file`, {
			method: 'POST',
			body: JSON.stringify({ filePath, content })
		});
	}

	async createFolder(
		repoName: string,
		folderPath: string,
		userId = 'anonymous'
	): Promise<CreateFolderResponse> {
		return this.request<CreateFolderResponse>(`/api/files/${userId}/${repoName}/create-folder`, {
			method: 'POST',
			body: JSON.stringify({ folderPath })
		});
	}

	async deleteFile(
		repoName: string,
		filePath: string,
		userId = 'anonymous'
	): Promise<DeleteFileResponse> {
		return this.request<DeleteFileResponse>(`/api/files/${userId}/${repoName}/delete`, {
			method: 'DELETE',
			body: JSON.stringify({ filePath })
		});
	}

	async renameFile(
		repoName: string,
		oldPath: string,
		newPath: string,
		userId = 'anonymous'
	): Promise<RenameFileResponse> {
		return this.request<RenameFileResponse>(`/api/files/${userId}/${repoName}/rename`, {
			method: 'PUT',
			body: JSON.stringify({ oldPath, newPath })
		});
	}

	async sendClaudeMessage(
		repoName: string,
		message: string,
		userId = 'anonymous'
	): Promise<ClaudeAiResponse> {
		return this.request<ClaudeAiResponse>('/api/claude', {
			method: 'POST',
			body: JSON.stringify({ repoName, message, userId })
		});
	}

	async sendClaudeMessageStreaming(
		repoName: string,
		message: string,
		onChunk: (chunk: string) => void,
		userId = 'anonymous'
	): Promise<void> {
		const response = await fetch(`${this.baseUrl}/api/claude`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ repoName, message, userId })
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to send message');
		}

		if (!response.body) {
			throw new Error('No response body');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		try {
			while (true) {
				const { done, value } = await reader.read();
				
				if (done) {
					break;
				}

				const chunk = decoder.decode(value, { stream: true });
				onChunk(chunk);
			}
		} finally {
			reader.releaseLock();
		}
	}

	async startClaudeInteractiveSetup(
		repoName: string,
		userId = 'anonymous',
		step = 'start'
	): Promise<{
		message: string;
		authUrl?: string;
		step: string;
		instructions?: string[];
		output?: string;
		warning?: string;
		configured?: boolean;
		needsUserCode?: boolean;
		sessionId?: string;
	}> {
		return this.request('/api/claude/interactive-setup', {
			method: 'POST',
			body: JSON.stringify({ repoName, userId, step })
		});
	}

	async verifyClaudeCode(
		repoName: string,
		verificationCode: string,
		sessionId: string,
		userId = 'anonymous'
	): Promise<{
		message: string;
		step: string;
		configured?: boolean;
		error?: string;
	}> {
		return this.request('/api/claude/verify-code', {
			method: 'POST',
			body: JSON.stringify({ repoName, verificationCode, sessionId, userId })
		});
	}

	async clearClaudeSession(
		repoName: string,
		userId = 'anonymous'
	): Promise<{
		message: string;
		sessionId?: string;
	}> {
		return this.request(`/api/claude/session/${userId}/${repoName}`, {
			method: 'DELETE'
		});
	}

	async ensureUserContainer(
		repoName: string,
		userId: string
	): Promise<{ message: string; containerName: string; status: string; volumeName: string }> {
		return this.request(`/api/containers/${userId}/${repoName}/ensure`, {
			method: 'POST'
		});
	}
}

export const apiClient = new ApiClient();
export default apiClient;
