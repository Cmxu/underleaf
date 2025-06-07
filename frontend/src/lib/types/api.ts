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

export interface ApiError {
	error: string;
}