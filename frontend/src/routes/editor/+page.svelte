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
				// Add base URL if it's a relative URL
				pdfUrl = result.pdfUrl.startsWith('http') 
					? result.pdfUrl 
					: `http://localhost:3001${result.pdfUrl}`;
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
		</div>
	</header>

	<!-- Main Editor Area -->
	<div class="flex-1 flex overflow-hidden">
		<!-- File Tree Sidebar -->
		<aside class="w-64 bg-dark-800 border-r border-gray-700 overflow-y-auto">
			<FileTree repoName={currentRepoName} onFileSelect={handleFileSelect} />
		</aside>

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