<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import FileTree from '$components/FileTree.svelte';
	import PdfPreview from '$components/PdfPreview.svelte';
	import { apiClient } from '$lib/utils/api';
	
	let editorContainer: HTMLDivElement;
	let monacoEditor: any = null;
	let monaco: any = null;
	let isCompiling = false;
	let compileError: string | null = null;
	let compileSuccess = false;
	let currentRepoName: string | null = null;
	let currentFilePath: string | null = null;
	let unsavedChanges = false;
	let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
	let pdfUrl: string | null = null;
	
	// Git state
	let gitStatus: any = null;
	let isCommitting = false;
	let isPushing = false;
	let commitMessage = '';
	let showGitPanel = false;
	let commitSuccess = false;
	let pushSuccess = false;
	let gitError: string | null = null;

	// Get repo name from URL params or localStorage
	onMount(async () => {
		// Try to get repository name from URL params or localStorage
		const searchParams = new URLSearchParams(window.location.search);
		currentRepoName = searchParams.get('repo') || localStorage.getItem('currentRepo');
		
		if (!currentRepoName) {
			// Redirect to home if no repository is specified
			goto('/');
			return;
		}

		await initializeMonaco();
	});

	async function initializeMonaco() {
		try {
			const monacoLoader = await import('@monaco-editor/loader');
			monacoLoader.default.config({
				paths: { 
					vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' 
				}
			});
			
			monaco = await monacoLoader.default.init();
			
			// Register LaTeX language if not already registered
			if (!monaco.languages.getLanguages().find((lang: any) => lang.id === 'latex')) {
				monaco.languages.register({ id: 'latex' });
				
				// Basic LaTeX syntax highlighting
				monaco.languages.setMonarchTokensProvider('latex', {
					tokenizer: {
						root: [
							[/\\[a-zA-Z@]+/, 'keyword'],
							[/\{[^}]*\}/, 'string'],
							[/%.*$/, 'comment'],
							[/\$[^$]*\$/, 'number'], // Math mode
							[/\$\$[^$]*\$\$/, 'number'], // Display math
						]
					}
				});
			}
			
			monacoEditor = monaco.editor.create(editorContainer, {
				value: '% Welcome to Underleaf!\n% Select a file from the file tree to start editing\n\n\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n\\usepackage{amsmath}\n\\usepackage{amsfonts}\n\\usepackage{amssymb}\n\\usepackage{graphicx}\n\n\\title{Your Document Title}\n\\author{Your Name}\n\\date{\\today}\n\n\\begin{document}\n\n\\maketitle\n\n\\section{Introduction}\n\nYour content here...\n\n\\end{document}',
				language: 'latex',
				theme: 'vs-dark',
				fontSize: 14,
				fontFamily: 'JetBrains Mono, Consolas, Monaco, monospace',
				wordWrap: 'on',
				automaticLayout: true,
				minimap: { enabled: false },
				scrollBeyondLastLine: false,
				renderLineHighlight: 'line',
				lineNumbers: 'on',
				folding: true,
				bracketMatching: 'always',
				autoIndent: 'full',
				tabSize: 2,
				insertSpaces: true
			});

			// Auto-save on content change
			monacoEditor.onDidChangeModelContent(() => {
				unsavedChanges = true;
				
				if (autoSaveTimeout) {
					clearTimeout(autoSaveTimeout);
				}
				
				autoSaveTimeout = setTimeout(() => {
					if (currentFilePath && unsavedChanges) {
						handleSaveFile();
					}
				}, 2000); // Auto-save after 2 seconds of inactivity
			});

			// Add LaTeX-specific keybindings
			monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
				handleSaveFile();
			});

		} catch (error) {
			console.error('Failed to initialize Monaco Editor:', error);
		}
	}

	async function handleFileSelect(filePath: string) {
		if (!currentRepoName) return;
		
		try {
			const response = await apiClient.getFileContent(currentRepoName, filePath);
			
			if (monacoEditor) {
				monacoEditor.setValue(response.content);
				currentFilePath = filePath;
				unsavedChanges = false;
				compileError = null;
				compileSuccess = false;
				
				// Set language based on file extension
				const ext = filePath.split('.').pop()?.toLowerCase();
				const language = ext === 'tex' ? 'latex' : 
								 ext === 'bib' ? 'bibtex' :
								 ext === 'md' ? 'markdown' :
								 ext === 'json' ? 'json' : 'plaintext';
				
				monaco.editor.setModelLanguage(monacoEditor.getModel(), language);
			}
		} catch (err) {
			compileError = err instanceof Error ? err.message : 'Failed to load file';
		}
	}

	async function handleSaveFile() {
		if (!currentRepoName || !currentFilePath || !monacoEditor) return;
		
		try {
			const content = monacoEditor.getValue();
			await apiClient.saveFile(currentRepoName, currentFilePath, content);
			unsavedChanges = false;
			
			if (autoSaveTimeout) {
				clearTimeout(autoSaveTimeout);
				autoSaveTimeout = null;
			}
		} catch (err) {
			console.error('Failed to save file:', err);
		}
	}

	async function handleCompile() {
		if (!currentRepoName) return;
		
		isCompiling = true;
		compileError = null;
		compileSuccess = false;

		// Save current file before compiling
		if (currentFilePath && unsavedChanges) {
			await handleSaveFile();
		}

		try {
			const texFile = currentFilePath?.endsWith('.tex') ? currentFilePath : 'main.tex';
			const result = await apiClient.compileRepo(currentRepoName, 'anonymous', texFile);
			compileSuccess = true;
			
			if (result.pdfUrl) {
				// Use relative URL since we're proxying through Vite
				pdfUrl = result.pdfUrl;
			}
			
			console.log('Compilation successful:', result);
		} catch (err) {
			compileError = err instanceof Error ? err.message : 'Compilation failed';
		} finally {
			isCompiling = false;
		}
	}

	function handleGoHome() {
		if (currentRepoName) {
			localStorage.removeItem('currentRepo');
		}
		goto('/');
	}

	async function handleRefreshGitStatus() {
		if (!currentRepoName) return;
		
		try {
			gitStatus = await apiClient.getGitStatus(currentRepoName);
			gitError = null;
		} catch (err) {
			gitError = err instanceof Error ? err.message : 'Failed to get Git status';
		}
	}

	async function handleCommit() {
		if (!currentRepoName || !commitMessage.trim()) return;
		
		isCommitting = true;
		commitSuccess = false;
		gitError = null;

		try {
			await apiClient.commitChanges(currentRepoName, commitMessage.trim());
			commitSuccess = true;
			commitMessage = '';
			
			// Refresh Git status after committing
			await handleRefreshGitStatus();
			
			// Clear success message after 3 seconds
			setTimeout(() => {
				commitSuccess = false;
			}, 3000);
		} catch (err) {
			gitError = err instanceof Error ? err.message : 'Failed to commit changes';
		} finally {
			isCommitting = false;
		}
	}

	async function handlePush() {
		if (!currentRepoName) return;
		
		isPushing = true;
		pushSuccess = false;
		gitError = null;

		try {
			await apiClient.pushChanges(currentRepoName);
			pushSuccess = true;
			
			// Clear success message after 3 seconds
			setTimeout(() => {
				pushSuccess = false;
			}, 3000);
		} catch (err) {
			gitError = err instanceof Error ? err.message : 'Failed to push changes';
		} finally {
			isPushing = false;
		}
	}

	function toggleGitPanel() {
		showGitPanel = !showGitPanel;
		if (showGitPanel && currentRepoName) {
			handleRefreshGitStatus();
		}
	}

	function getFileNameFromPath(path: string | null): string {
		if (!path) return 'Untitled';
		return path.split('/').pop() || path;
	}
</script>

<svelte:head>
	<title>Editor - Underleaf</title>
</svelte:head>

<div class="h-screen flex flex-col bg-dark-900">
	<!-- Header -->
	<header class="bg-dark-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
		<div class="flex items-center space-x-4">
			<button
				on:click={handleGoHome}
				class="text-gray-300 hover:text-white transition-colors"
				aria-label="Go back to home"
			>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
				</svg>
			</button>
			<div>
				<h1 class="text-xl font-semibold text-white">Underleaf Editor</h1>
				{#if currentRepoName}
					<p class="text-sm text-gray-400">{currentRepoName}</p>
				{/if}
			</div>
		</div>

		<div class="flex items-center space-x-4">
			{#if currentFilePath}
				<div class="text-sm text-gray-300 flex items-center space-x-2">
					<span>📄</span>
					<span>{getFileNameFromPath(currentFilePath)}</span>
					{#if unsavedChanges}
						<span class="text-orange-400" title="Unsaved changes">●</span>
					{/if}
				</div>
			{/if}
			
			{#if compileSuccess}
				<div class="text-green-400 text-sm flex items-center space-x-2">
					<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/>
					</svg>
					<span>Compiled successfully</span>
				</div>
			{/if}
			
			{#if currentFilePath}
				<button
					on:click={handleSaveFile}
					disabled={!unsavedChanges}
					class="text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					title="Save file (Ctrl+S)"
					aria-label="Save file"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12"/>
					</svg>
				</button>
			{/if}
			
			<button
				on:click={handleCompile}
				disabled={isCompiling || !currentRepoName}
				class="btn-primary px-6 py-2 text-sm disabled:opacity-50"
			>
				{#if isCompiling}
					<div class="flex items-center space-x-2">
						<div class="loading-spinner w-4 h-4"></div>
						<span>Compiling...</span>
					</div>
				{:else}
					Compile PDF
				{/if}
			</button>
			
			<button
				on:click={toggleGitPanel}
				class="text-gray-400 hover:text-white transition-colors p-2 rounded {showGitPanel ? 'bg-gray-700' : ''}"
				title="Git Operations"
				aria-label="Git Operations"
			>
				<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
					<path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
					<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"/>
				</svg>
			</button>
		</div>
	</header>

	<!-- Main Editor Area -->
	<div class="flex-1 flex overflow-hidden">
		<!-- File Tree Sidebar -->
		<aside class="w-64 bg-dark-800 border-r border-gray-700 overflow-y-auto">
			<FileTree repoName={currentRepoName} onFileSelect={handleFileSelect} />
		</aside>

		<!-- Git Panel -->
		{#if showGitPanel}
			<aside class="w-80 bg-dark-800 border-r border-gray-700 overflow-y-auto">
				<div class="p-4">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-lg font-medium text-white">Git Operations</h3>
						<button
							on:click={handleRefreshGitStatus}
							class="text-gray-400 hover:text-white transition-colors"
							title="Refresh Git status"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
							</svg>
						</button>
					</div>

					{#if gitError}
						<div class="bg-red-500/10 border border-red-500/20 rounded p-3 mb-4">
							<p class="text-red-300 text-sm">{gitError}</p>
						</div>
					{/if}

					{#if commitSuccess}
						<div class="bg-green-500/10 border border-green-500/20 rounded p-3 mb-4">
							<p class="text-green-300 text-sm">Changes committed successfully!</p>
						</div>
					{/if}

					{#if pushSuccess}
						<div class="bg-green-500/10 border border-green-500/20 rounded p-3 mb-4">
							<p class="text-green-300 text-sm">Changes pushed successfully!</p>
						</div>
					{/if}

					{#if gitStatus}
						<div class="mb-6">
							<h4 class="text-sm font-medium text-gray-300 mb-2">Repository Status</h4>
							<div class="mb-3 pb-2 border-b border-gray-600">
								<p class="text-blue-400 text-sm">
									<svg class="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
										<path fill-rule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414L2.586 7l3.707-3.707a1 1 0 011.414 0z"/>
									</svg>
									Branch: {gitStatus.currentBranch}
								</p>
								{#if gitStatus.tracking}
									<p class="text-gray-400 text-xs">Tracking: {gitStatus.tracking}</p>
								{/if}
							</div>
							{#if gitStatus.clean}
								<p class="text-green-400 text-sm">✓ Working directory clean</p>
							{:else}
								<div class="space-y-2">
									{#if gitStatus.modified.length > 0}
										<div>
											<p class="text-yellow-400 text-sm font-medium">Modified ({gitStatus.modified.length})</p>
											{#each gitStatus.modified as file}
												<p class="text-gray-400 text-xs ml-2">• {file}</p>
											{/each}
										</div>
									{/if}
									{#if gitStatus.untracked.length > 0}
										<div>
											<p class="text-red-400 text-sm font-medium">Untracked ({gitStatus.untracked.length})</p>
											{#each gitStatus.untracked as file}
												<p class="text-gray-400 text-xs ml-2">• {file}</p>
											{/each}
										</div>
									{/if}
									{#if gitStatus.added.length > 0}
										<div>
											<p class="text-green-400 text-sm font-medium">Added ({gitStatus.added.length})</p>
											{#each gitStatus.added as file}
												<p class="text-gray-400 text-xs ml-2">• {file}</p>
											{/each}
										</div>
									{/if}
									{#if gitStatus.deleted.length > 0}
										<div>
											<p class="text-red-400 text-sm font-medium">Deleted ({gitStatus.deleted.length})</p>
											{#each gitStatus.deleted as file}
												<p class="text-gray-400 text-xs ml-2">• {file}</p>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/if}

					{#if gitStatus && !gitStatus.clean}
						<div class="mb-4">
							<label for="commit-message" class="block text-sm font-medium text-gray-300 mb-2">
								Commit Message
							</label>
							<textarea
								id="commit-message"
								bind:value={commitMessage}
								placeholder="Enter commit message..."
								class="w-full px-3 py-2 bg-dark-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 text-sm"
								rows="3"
							></textarea>
						</div>

						<div class="flex space-x-2 mb-4">
							<button
								on:click={handleCommit}
								disabled={isCommitting || !commitMessage.trim()}
								class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-4 rounded text-sm transition-colors"
							>
								{#if isCommitting}
									<div class="flex items-center justify-center space-x-2">
										<div class="loading-spinner w-4 h-4"></div>
										<span>Committing...</span>
									</div>
								{:else}
									Commit Changes
								{/if}
							</button>
						</div>
					{/if}

					<button
						on:click={handlePush}
						disabled={isPushing || !currentRepoName}
						class="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-4 rounded text-sm transition-colors"
					>
						{#if isPushing}
							<div class="flex items-center justify-center space-x-2">
								<div class="loading-spinner w-4 h-4"></div>
								<span>Pushing...</span>
							</div>
						{:else}
							Push to Remote
						{/if}
					</button>
				</div>
			</aside>
		{/if}

		<!-- Editor -->
		<div class="flex-1 flex flex-col">
			{#if currentFilePath}
				<div class="bg-dark-700 px-4 py-2 border-b border-gray-600 text-sm text-gray-300 flex items-center justify-between">
					<span>Editing: {getFileNameFromPath(currentFilePath)}</span>
					<span class="text-xs text-gray-500">Auto-save enabled</span>
				</div>
			{/if}
			
			<div class="flex-1 relative">
				<div bind:this={editorContainer} class="w-full h-full"></div>
			</div>
			
			{#if compileError}
				<div class="bg-red-500/10 border-t border-red-500/20 p-4 text-red-300">
					<div class="flex items-start space-x-2">
						<svg class="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"/>
						</svg>
						<div>
							<p class="font-medium">Compilation Error</p>
							<p class="text-sm text-red-200 mt-1">{compileError}</p>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- PDF Preview -->
		<aside class="w-1/2 border-l border-gray-700">
			<PdfPreview 
				{pdfUrl} 
				isLoading={isCompiling} 
				error={compileError} 
			/>
		</aside>
	</div>
</div>