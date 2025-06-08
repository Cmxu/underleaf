<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import FileTree from '$components/FileTree.svelte';
	import PdfPreview from '$components/PdfPreview.svelte';
	import { apiClient } from '$lib/utils/api';
	import type { GitStatusResponse } from '$lib/types/api';

	let editorContainer: HTMLDivElement;
	let monacoEditor: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
	let monaco: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
	let isCompiling = false;
	let compileError: string | null = null;
	let compileSuccess = false;
	let currentRepoName: string | null = null;
	let currentFilePath: string | null = null;
	let unsavedChanges = false;
	let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
	let pdfUrl: string | null = null;

	// Layout state
	let layoutMode: 'both' | 'editor' | 'pdf' = 'both';
	let fileTreeWidth = 256; // 16rem in pixels
	let editorWidth = 50; // percentage for editor when in 'both' mode
	let isResizing = false;
	let resizingPanel: 'filetree' | 'editor-pdf' | 'git-split' | null = null;
	let gitPanelHeight = 40; // percentage for git panel height within sidebar

	// Git state
	let gitStatus: GitStatusResponse | null = null;
	let isCommitting = false;
	let isPushing = false;
	let isFetching = false;
	let isPulling = false;
	let commitMessage = '';
	let commitSuccess = false;
	let pushSuccess = false;
	let fetchSuccess = false;
	let pullSuccess = false;
	let gitError: string | null = null;

	// Reactive statement to handle layout mode changes
	$: if (monacoEditor && (layoutMode === 'editor' || layoutMode === 'both')) {
		// Use a small delay to ensure DOM has updated
		setTimeout(() => {
			if (monacoEditor && editorContainer) {
				const rect = editorContainer.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0) {
					monacoEditor.layout();
				}
			}
		}, 50);
	}

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

		// Load git status on mount
		await handleRefreshGitStatus();
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
			if (!monaco.languages.getLanguages().find((lang: any) => lang.id === 'latex')) { // eslint-disable-line @typescript-eslint/no-explicit-any
				monaco.languages.register({ id: 'latex' });

				// Basic LaTeX syntax highlighting
				monaco.languages.setMonarchTokensProvider('latex', {
					tokenizer: {
						root: [
							[/\\[a-zA-Z@]+/, 'keyword'],
							[/\{[^}]*\}/, 'string'],
							[/%.*$/, 'comment'],
							[/\$[^$]*\$/, 'number'], // Math mode
							[/\$\$[^$]*\$\$/, 'number'] // Display math
						]
					}
				});
			}

			monacoEditor = monaco.editor.create(editorContainer, {
				value:
					'% Welcome to Underleaf!\n% Select a file from the file tree to start editing\n\n\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n\\usepackage{amsmath}\n\\usepackage{amsfonts}\n\\usepackage{amssymb}\n\\usepackage{graphicx}\n\n\\title{Your Document Title}\n\\author{Your Name}\n\\date{\\today}\n\n\\begin{document}\n\n\\maketitle\n\n\\section{Introduction}\n\nYour content here...\n\n\\end{document}',
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

			// Ensure editor layout is correct after initialization
			setTimeout(() => {
				if (monacoEditor) {
					monacoEditor.layout();
				}
			}, 100);
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
				const language =
					ext === 'tex'
						? 'latex'
						: ext === 'bib'
							? 'bibtex'
							: ext === 'md'
								? 'markdown'
								: ext === 'json'
									? 'json'
									: 'plaintext';

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

	async function handleFetch() {
		if (!currentRepoName) return;

		isFetching = true;
		fetchSuccess = false;
		gitError = null;

		try {
			await apiClient.fetchChanges(currentRepoName);
			fetchSuccess = true;

			// Refresh Git status after fetching
			await handleRefreshGitStatus();

			// Clear success message after 3 seconds
			setTimeout(() => {
				fetchSuccess = false;
			}, 3000);
		} catch (err) {
			gitError = err instanceof Error ? err.message : 'Failed to fetch changes';
		} finally {
			isFetching = false;
		}
	}

	async function handlePull() {
		if (!currentRepoName) return;

		isPulling = true;
		pullSuccess = false;
		gitError = null;

		try {
			await apiClient.pullChanges(currentRepoName);
			pullSuccess = true;

			// Refresh Git status after pulling
			await handleRefreshGitStatus();
			// Note: File tree will be updated automatically due to reactive statements

			// Clear success message after 3 seconds
			setTimeout(() => {
				pullSuccess = false;
			}, 3000);
		} catch (err) {
			gitError = err instanceof Error ? err.message : 'Failed to pull changes';
		} finally {
			isPulling = false;
		}
	}

	function getFileNameFromPath(path: string | null): string {
		if (!path) return 'Untitled';
		return path.split('/').pop() || path;
	}

	// Layout functions
	function setLayoutMode(mode: 'both' | 'editor' | 'pdf') {
		const previousMode = layoutMode;
		layoutMode = mode;

		// If switching from PDF-only to a mode that includes the editor, recreate the editor
		if (previousMode === 'pdf' && (mode === 'editor' || mode === 'both')) {
			console.log('Switching from PDF to editor mode, recreating editor...');

			// Store current content
			const currentContent = monacoEditor ? monacoEditor.getValue() : '';
			const currentLanguage = monacoEditor ? monacoEditor.getModel()?.getLanguageId() : 'latex';

			// Dispose and recreate the editor
			if (monacoEditor) {
				monacoEditor.dispose();
				monacoEditor = null;
			}

			// Wait for DOM to update, then recreate
			setTimeout(async () => {
				if (editorContainer && monaco) {
					console.log('Recreating Monaco editor...');

					monacoEditor = monaco.editor.create(editorContainer, {
						value: currentContent,
						language: currentLanguage,
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

					// Re-add event listeners
					monacoEditor.onDidChangeModelContent(() => {
						unsavedChanges = true;

						if (autoSaveTimeout) {
							clearTimeout(autoSaveTimeout);
						}

						autoSaveTimeout = setTimeout(() => {
							if (currentFilePath && unsavedChanges) {
								handleSaveFile();
							}
						}, 2000);
					});

					monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
						handleSaveFile();
					});

					console.log('Editor recreated successfully');
				}
			}, 100);
		} else {
			// Normal layout trigger for other mode changes
			setTimeout(() => {
				if (monacoEditor) {
					monacoEditor.layout();
				}
			}, 100);
		}
	}

	// Performance-optimized resize functions with GPU acceleration
	let rafId: number | null = null;
	let pendingResizeEvent: MouseEvent | null = null;

	function startResize(panel: 'filetree' | 'editor-pdf' | 'git-split', event: MouseEvent) {
		isResizing = true;
		resizingPanel = panel;
		event.preventDefault();

		// Add performance optimization classes and prevent iframe event capture
		if (panel === 'editor-pdf') {
			const mainArea = document.querySelector('.main-content-area') as HTMLElement;
			if (mainArea) {
				mainArea.style.willChange = 'transform';
			}

			// Prevent PDF iframe from capturing mouse events during resize
			const pdfIframes = document.querySelectorAll('iframe');
			pdfIframes.forEach(iframe => {
				iframe.style.pointerEvents = 'none';
			});

			// Add transparent overlay to ensure mouse events are captured
			const overlay = document.createElement('div');
			overlay.id = 'resize-overlay';
			overlay.style.cssText = `
				position: fixed;
				top: 0;
				left: 0;
				width: 100vw;
				height: 100vh;
				background: transparent;
				z-index: 9999;
				cursor: col-resize;
				pointer-events: auto;
			`;
			document.body.appendChild(overlay);

			// Add body class for consistent cursor styling
			document.body.classList.add('resizing-editor-pdf');
		}

		document.addEventListener('mousemove', handleResizeThrottled);
		document.addEventListener('mouseup', stopResize);
	}

	function handleResizeThrottled(event: MouseEvent) {
		if (!isResizing || !resizingPanel) return;

		pendingResizeEvent = event;

		// Use immediate update for first event, then throttle subsequent ones
		if (rafId === null) {
			rafId = requestAnimationFrame(() => {
				if (pendingResizeEvent) {
					handleResize(pendingResizeEvent);
					pendingResizeEvent = null;
				}
				rafId = null;
			});
		}
	}

	function handleResize(event: MouseEvent) {
		if (!isResizing || !resizingPanel) return;

		const newX = event.clientX;
		const newY = event.clientY;

		if (resizingPanel === 'filetree') {
			const minWidth = 200;
			const maxWidth = 500;
			fileTreeWidth = Math.min(Math.max(newX, minWidth), maxWidth);
		} else if (resizingPanel === 'editor-pdf') {
			// Calculate percentage based on the main content area
			const mainArea = document.querySelector('.main-content-area') as HTMLElement;
			if (mainArea) {
				const rect = mainArea.getBoundingClientRect();
				
				// Ensure we have valid dimensions
				if (rect.width <= 0) return;
				
				const relativeX = newX - rect.left; // Allow negative values for leftward dragging
				const percentage = (relativeX / rect.width) * 100; // Allow negative percentages
				const newWidth = Math.min(Math.max(percentage, 20), 80); // 20% to 80% range

				// Always update to allow smooth bidirectional resizing
				editorWidth = newWidth;
			}
		} else if (resizingPanel === 'git-split') {
			// Calculate percentage based on the sidebar height
			const sidebar = document.querySelector('aside') as HTMLElement;
			if (sidebar) {
				const rect = sidebar.getBoundingClientRect();
				const relativeY = newY - rect.top;
				const percentage = ((rect.height - relativeY) / rect.height) * 100;
				const newHeight = Math.min(Math.max(percentage, 20), 70); // 20% to 70% range

				// Always update for smooth bidirectional resizing
				gitPanelHeight = newHeight;
			}
		}
	}

	function stopResize() {
		const wasEditorPdfResize = resizingPanel === 'editor-pdf';
		isResizing = false;
		resizingPanel = null;

		// Clean up RAF and performance optimizations
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		pendingResizeEvent = null;

		// Remove performance optimization classes and restore iframe events
		const mainArea = document.querySelector('.main-content-area') as HTMLElement;
		if (mainArea) {
			mainArea.style.willChange = 'auto';
		}

		// Restore PDF iframe pointer events
		const pdfIframes = document.querySelectorAll('iframe');
		pdfIframes.forEach(iframe => {
			iframe.style.pointerEvents = 'auto';
		});

		// Remove transparent overlay
		const overlay = document.getElementById('resize-overlay');
		if (overlay) {
			overlay.remove();
		}

		// Remove body class
		document.body.classList.remove('resizing-editor-pdf');

		// Debounce Monaco editor layout call for better performance
		if (monacoEditor && wasEditorPdfResize) {
			setTimeout(() => {
				if (monacoEditor) {
					monacoEditor.layout();
				}
			}, 100); // Increased debounce for better performance
		}

		document.removeEventListener('mousemove', handleResizeThrottled);
		document.removeEventListener('mouseup', stopResize);
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
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 19l-7-7m0 0l7-7m-7 7h18"
					/>
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
			<!-- Layout Toggle Buttons -->
			<div class="flex items-center space-x-1 bg-dark-700 rounded p-1">
				<button
					on:click={() => setLayoutMode('editor')}
					class="px-3 py-1.5 text-xs rounded transition-colors {layoutMode === 'editor'
						? 'bg-blue-600 text-white'
						: 'text-gray-400 hover:text-white hover:bg-gray-600'}"
					title="Editor only"
				>
					Editor
				</button>
				<button
					on:click={() => setLayoutMode('both')}
					class="px-3 py-1.5 text-xs rounded transition-colors {layoutMode === 'both'
						? 'bg-blue-600 text-white'
						: 'text-gray-400 hover:text-white hover:bg-gray-600'}"
					title="Side by side"
				>
					Both
				</button>
				<button
					on:click={() => setLayoutMode('pdf')}
					class="px-3 py-1.5 text-xs rounded transition-colors {layoutMode === 'pdf'
						? 'bg-blue-600 text-white'
						: 'text-gray-400 hover:text-white hover:bg-gray-600'}"
					title="PDF only"
				>
					PDF
				</button>
			</div>

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
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
						/>
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
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12"
						/>
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
		<!-- File Tree + Git Sidebar -->
		<aside
			class="bg-dark-800 border-r border-gray-700 relative flex flex-col"
			style="width: {fileTreeWidth}px;"
		>
			<!-- File Tree (Top Half) -->
			<div
				class="overflow-y-auto border-b border-gray-700"
				style="height: {100 - gitPanelHeight}%;"
			>
				<FileTree repoName={currentRepoName} onFileSelect={handleFileSelect} />
			</div>

			<!-- Git Panel Resize Handle -->
			<div
				role="separator"
				tabindex="0"
				aria-label="Resize git panel"
				class="h-1 w-full cursor-row-resize hover:bg-blue-500 bg-gray-600 transition-colors"
				on:mousedown={(e) => startResize('git-split', e)}
			></div>

			<!-- Git Panel (Bottom Half) -->
			<div class="overflow-y-auto" style="height: {gitPanelHeight}%;">
				<div class="p-4">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-lg font-medium text-white">Git Operations</h3>
						<button
							on:click={handleRefreshGitStatus}
							class="text-gray-400 hover:text-white transition-colors"
							title="Refresh Git status"
							aria-label="Refresh Git status"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
								/>
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

					{#if fetchSuccess}
						<div class="bg-yellow-500/10 border border-yellow-500/20 rounded p-3 mb-4">
							<p class="text-yellow-300 text-sm">Changes fetched successfully!</p>
						</div>
					{/if}

					{#if pullSuccess}
						<div class="bg-purple-500/10 border border-purple-500/20 rounded p-3 mb-4">
							<p class="text-purple-300 text-sm">Changes pulled successfully!</p>
						</div>
					{/if}

					{#if gitStatus}
						<div class="mb-6">
							<h4 class="text-sm font-medium text-gray-300 mb-2">Repository Status</h4>
							<div class="mb-3 pb-2 border-b border-gray-600">
								<p class="text-blue-400 text-sm">
									<svg class="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
										<path
											fill-rule="evenodd"
											d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414L2.586 7l3.707-3.707a1 1 0 011.414 0z"
										/>
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
											<p class="text-yellow-400 text-sm font-medium">
												Modified ({gitStatus.modified.length})
											</p>
											{#each gitStatus.modified as file}
												<p class="text-gray-400 text-xs ml-2">• {file}</p>
											{/each}
										</div>
									{/if}
									{#if gitStatus.untracked.length > 0}
										<div>
											<p class="text-red-400 text-sm font-medium">
												Untracked ({gitStatus.untracked.length})
											</p>
											{#each gitStatus.untracked as file}
												<p class="text-gray-400 text-xs ml-2">• {file}</p>
											{/each}
										</div>
									{/if}
									{#if gitStatus.added.length > 0}
										<div>
											<p class="text-green-400 text-sm font-medium">
												Added ({gitStatus.added.length})
											</p>
											{#each gitStatus.added as file}
												<p class="text-gray-400 text-xs ml-2">• {file}</p>
											{/each}
										</div>
									{/if}
									{#if gitStatus.deleted.length > 0}
										<div>
											<p class="text-red-400 text-sm font-medium">
												Deleted ({gitStatus.deleted.length})
											</p>
											{#each gitStatus.deleted as file}
												<p class="text-gray-400 text-xs ml-2">• {file}</p>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/if}

					<!-- Fetch and Pull buttons -->
					<div class="flex space-x-2 mb-4">
						<button
							on:click={handleFetch}
							disabled={isFetching || !currentRepoName}
							class="flex-1 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-4 rounded text-sm transition-colors"
						>
							{#if isFetching}
								<div class="flex items-center justify-center space-x-2">
									<div class="loading-spinner w-4 h-4"></div>
									<span>Fetching...</span>
								</div>
							{:else}
								Fetch
							{/if}
						</button>
						<button
							on:click={handlePull}
							disabled={isPulling || !currentRepoName}
							class="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-4 rounded text-sm transition-colors"
						>
							{#if isPulling}
								<div class="flex items-center justify-center space-x-2">
									<div class="loading-spinner w-4 h-4"></div>
									<span>Pulling...</span>
								</div>
							{:else}
								Pull
							{/if}
						</button>
					</div>

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
			</div>

			<!-- Sidebar Resize Handle -->
			<div
				role="separator"
				tabindex="0"
				aria-label="Resize file tree panel"
				class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 bg-transparent transition-colors"
				on:mousedown={(e) => startResize('filetree', e)}
			></div>
		</aside>

		<!-- Main Content Area (Editor + PDF) -->
		<div class="flex-1 flex main-content-area" style="contain: layout style;">
			<!-- Editor -->
			{#if layoutMode === 'editor' || layoutMode === 'both'}
				<div
					class="flex flex-col {layoutMode === 'both' ? '' : 'flex-1'}"
					style={layoutMode === 'both'
						? `width: ${editorWidth}%; transform: translateZ(0); will-change: width;`
						: 'transform: translateZ(0);'}
				>
					{#if currentFilePath}
						<div
							class="bg-dark-700 px-4 py-2 border-b border-gray-600 text-sm text-gray-300 flex items-center justify-between"
						>
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
									<path
										fill-rule="evenodd"
										d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
									/>
								</svg>
								<div>
									<p class="font-medium">Compilation Error</p>
									<p class="text-sm text-red-200 mt-1">{compileError}</p>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Resize Handle between Editor and PDF -->
			{#if layoutMode === 'both'}
				<div
					role="separator"
					tabindex="0"
					aria-label="Resize editor and PDF panels"
					class="w-1 bg-gray-600 hover:bg-blue-500 cursor-col-resize transition-colors relative"
					style="transform: translateZ(0); will-change: background-color;"
					on:mousedown={(e) => startResize('editor-pdf', e)}
				></div>
			{/if}

			<!-- PDF Preview -->
			{#if layoutMode === 'pdf' || layoutMode === 'both'}
				<div
					class="flex-1 border-l border-gray-700"
					style={layoutMode === 'both'
						? `width: ${100 - editorWidth}%; transform: translateZ(0); will-change: width;`
						: 'transform: translateZ(0);'}
				>
					<PdfPreview {pdfUrl} isLoading={isCompiling} error={compileError} />
				</div>
			{/if}
		</div>
	</div>
</div>
