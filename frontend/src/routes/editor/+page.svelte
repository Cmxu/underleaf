<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import FileTree from '$components/FileTree.svelte';
	import PdfPreview from '$components/PdfPreview.svelte';
	import AiChatPanel from '$components/AiChatPanel.svelte';
	import ClaudeCodeModal from '$components/ClaudeCodeModal.svelte';
	import { apiClient } from '$lib/utils/api';
	import { authStore } from '$lib/stores/auth';
	import type { GitStatusResponse } from '$lib/types/api';
	
	// Enhanced diff calculation for Monaco editor integration
	function calculateDiff(originalText: string, newText: string) {
		const originalLines = originalText.split('\n');
		const newLines = newText.split('\n');
		const diff = [];
		
		// Simple line-by-line diff - we can enhance this later
		const maxLines = Math.max(originalLines.length, newLines.length);
		
		for (let i = 0; i < maxLines; i++) {
			const originalLine = originalLines[i];
			const newLine = newLines[i];
			
			if (originalLine === undefined) {
				// Addition
				diff.push({ type: 'addition', line: newLine, lineNumber: i + 1 });
			} else if (newLine === undefined) {
				// Deletion
				diff.push({ type: 'deletion', line: originalLine, lineNumber: i + 1 });
			} else if (originalLine !== newLine) {
				// Modification
				diff.push({ type: 'deletion', line: originalLine, lineNumber: i + 1 });
				diff.push({ type: 'addition', line: newLine, lineNumber: i + 1 });
			} else {
				// No change
				diff.push({ type: 'context', line: originalLine, lineNumber: i + 1 });
			}
		}
		
		return diff;
	}

	// Find the range of changes in the editor content
	function findChangeRange(originalContent: string, oldString: string, newString: string) {
		const lines = originalContent.split('\n');
		const oldLines = oldString.split('\n');
		
		// Find where the old string starts in the content
		for (let i = 0; i <= lines.length - oldLines.length; i++) {
			let match = true;
			for (let j = 0; j < oldLines.length; j++) {
				if (lines[i + j] !== oldLines[j]) {
					match = false;
					break;
				}
			}
			if (match) {
				return {
					startLine: i + 1, // Monaco uses 1-based line numbers
					endLine: i + oldLines.length,
					startColumn: 1,
					endColumn: lines[i + oldLines.length - 1]?.length + 1 || 1
				};
			}
		}
		return null;
	}

	// Function to detect if a tool call is an Edit and create in-editor diff
	function processEditToolCall(toolCall: { name: string; arguments: any; id: string }) {
		console.log('🔍 Processing tool call:', toolCall);
		
		if (toolCall.name === 'Edit' && toolCall.arguments.file_path && toolCall.arguments.old_string && toolCall.arguments.new_string) {
			console.log('✅ Edit tool call detected!', {
				file_path: toolCall.arguments.file_path,
				old_string: toolCall.arguments.old_string?.substring(0, 100) + '...',
				new_string: toolCall.arguments.new_string?.substring(0, 100) + '...'
			});
			
			try {
				// Check if this edit is for the currently open file
				if (currentFilePath && toolCall.arguments.file_path === currentFilePath && monacoEditor) {
					const currentContent = monacoEditor.getValue();
					const range = findChangeRange(currentContent, toolCall.arguments.old_string, toolCall.arguments.new_string);
					
					if (range) {
						// Add to pending edits for in-editor display
						addPendingEdit({
							id: toolCall.id,
							range,
							oldString: toolCall.arguments.old_string,
							newString: toolCall.arguments.new_string,
							applied: false,
							decorationIds: [],
						});
						
						// Update preview content with all changes applied
						updatePreviewContent();
						
						return {
							filePath: toolCall.arguments.file_path,
							oldString: toolCall.arguments.old_string,
							newString: toolCall.arguments.new_string,
							applied: false,
							inEditor: true
						};
					}
				}
				
				// Fallback for other files or when range not found
				const diff = calculateDiff(toolCall.arguments.old_string, toolCall.arguments.new_string);
				
				const result = {
					filePath: toolCall.arguments.file_path,
					oldString: toolCall.arguments.old_string,
					newString: toolCall.arguments.new_string,
					diff,
					applied: false,
					inEditor: false
				};
				
				console.log('🎯 Created edit diff:', result);
				return result;
			} catch (error) {
				console.error('Error processing edit tool call:', error);
				return null;
			}
		} else {
			console.log('ℹ️ Not an Edit tool call or missing required arguments:', {
				name: toolCall.name,
				hasFilePath: !!toolCall.arguments?.file_path,
				hasOldString: !!toolCall.arguments?.old_string,
				hasNewString: !!toolCall.arguments?.new_string
			});
		}
		return null;
	}

	// Functions for managing in-editor diffs
	function addPendingEdit(edit: any) {
		pendingEdits = [...pendingEdits, edit];
		updateEditorDecorations();
	}

	function updateEditorDecorations() {
		if (!monacoEditor || !monaco) return;

		// Clear existing decorations
		if (editorDecorations.length > 0) {
			monacoEditor.deltaDecorations(editorDecorations, []);
			editorDecorations = [];
		}

		// Add decorations for each pending edit
		const decorations: any[] = [];
		
		pendingEdits.forEach((edit, index) => {
			if (!edit.applied) {
				// Highlight the range that will be changed
				decorations.push({
					range: new monaco.Range(edit.range.startLine, edit.range.startColumn, edit.range.endLine, edit.range.endColumn),
					options: {
						className: 'pending-edit-decoration',
						hoverMessage: { value: `**Pending Change ${index + 1}**\n\nOld: \`${edit.oldString}\`\n\nNew: \`${edit.newString}\`` },
						minimap: {
							color: '#ff9800',
							position: monaco.editor.MinimapPosition.Inline
						},
						overviewRuler: {
							color: '#ff9800',
							position: monaco.editor.OverviewRulerLane.Right
						}
					}
				});

				// Add line decorations to show deletion/addition indicators
				for (let line = edit.range.startLine; line <= edit.range.endLine; line++) {
					decorations.push({
						range: new monaco.Range(line, 1, line, 1),
						options: {
							isWholeLine: true,
							linesDecorationsClassName: 'pending-edit-line-decoration',
							marginClassName: 'pending-edit-margin'
						}
					});
				}
			}
		});

		if (decorations.length > 0) {
			editorDecorations = monacoEditor.deltaDecorations([], decorations);
		}

		// Add content widgets for action buttons
		addActionWidgets();
	}

	function addActionWidgets() {
		if (!monacoEditor || !monaco) return;

		pendingEdits.forEach((edit, index) => {
			if (!edit.applied && !edit.widgetId) {
				const widgetId = `pending-edit-widget-${edit.id}`;
				
				const widget = {
					getId: () => widgetId,
					getDomNode: () => {
						const domNode = document.createElement('div');
						domNode.className = 'pending-edit-widget';
						domNode.innerHTML = `
							<div class="pending-edit-actions">
								<button class="apply-btn" data-edit-id="${edit.id}">Apply</button>
								<button class="reject-btn" data-edit-id="${edit.id}">Reject</button>
								<span class="edit-preview">${edit.oldString.substring(0, 20)}... → ${edit.newString.substring(0, 20)}...</span>
							</div>
						`;
						
						// Add event listeners
						const applyBtn = domNode.querySelector('.apply-btn');
						const rejectBtn = domNode.querySelector('.reject-btn');
						
						applyBtn?.addEventListener('click', () => applyPendingEdit(edit.id));
						rejectBtn?.addEventListener('click', () => rejectPendingEdit(edit.id));
						
						return domNode;
					},
					getPosition: () => ({
						position: {
							lineNumber: edit.range.startLine,
							column: 1
						},
						preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE]
					})
				};

				monacoEditor.addContentWidget(widget);
				edit.widgetId = widgetId;
			}
		});
	}

	function updatePreviewContent() {
		if (!monacoEditor) return;
		
		// Start with current editor content
		let content = originalEditorContent || monacoEditor.getValue();
		
		// Apply all pending edits to create preview
		pendingEdits.forEach(edit => {
			content = content.replace(edit.oldString, edit.newString);
		});
		
		previewContent = content;
	}

	function applyPendingEdit(editId: string) {
		const editIndex = pendingEdits.findIndex(e => e.id === editId);
		if (editIndex === -1) return;

		const edit = pendingEdits[editIndex];
		
		// Apply the change to the editor
		const currentContent = monacoEditor.getValue();
		const newContent = currentContent.replace(edit.oldString, edit.newString);
		
		// Store original content if this is the first edit
		if (!originalEditorContent) {
			originalEditorContent = currentContent;
		}
		
		monacoEditor.setValue(newContent);
		
		// Mark as applied and remove from pending
		edit.applied = true;
		pendingEdits = pendingEdits.filter(e => e.id !== editId);
		
		// Remove the widget
		if (edit.widgetId) {
			monacoEditor.removeContentWidget({ getId: () => edit.widgetId });
		}
		
		// Update decorations
		updateEditorDecorations();
		updatePreviewContent();
		
		// Mark as unsaved
		unsavedChanges = true;
		
		console.log('Applied edit:', editId);
	}

	function rejectPendingEdit(editId: string) {
		const editIndex = pendingEdits.findIndex(e => e.id === editId);
		if (editIndex === -1) return;

		const edit = pendingEdits[editIndex];
		
		// Remove from pending edits
		pendingEdits = pendingEdits.filter(e => e.id !== editId);
		
		// Remove the widget
		if (edit.widgetId) {
			monacoEditor.removeContentWidget({ getId: () => edit.widgetId });
		}
		
		// Update decorations and preview
		updateEditorDecorations();
		updatePreviewContent();
		
		console.log('Rejected edit:', editId);
	}

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

	// Editor diff state
	let pendingEdits: Array<{
		id: string;
		range: any;
		oldString: string;
		newString: string;
		applied: boolean;
		decorationIds: string[];
		widgetId?: string;
	}> = [];
	let editorDecorations: string[] = [];
	let originalEditorContent: string = '';
	let previewContent: string = ''; // Content with all changes applied for PDF rendering

	// Layout state
	let layoutMode: 'both' | 'editor' | 'pdf' = 'both';
	let fileTreeWidth = 256; // 16rem in pixels
	let editorWidth = 50; // percentage for editor when in 'both' mode
	let isResizing = false;
	let resizingPanel: 'filetree' | 'editor-pdf' | 'git-split' | 'ai-chat' | null = null;
	let gitPanelHeight = 40; // percentage for git panel height within sidebar

	// AI Chat Panel state
	let showAiChat = false;
	let aiChatHeight = 400; // Default height in pixels
	let aiChatMessages: Array<{ 
		role: 'user' | 'assistant'; 
		content: string; 
		timestamp: Date;
		contentBlocks?: Array<{ 
			type: 'text' | 'tool_call'; 
			content?: string; 
			toolCall?: { name: string; id: string; arguments: any; expanded?: boolean; editDiff?: any };
		}>;
	}> = [];
	let aiChatLoading = false;

	// Claude Code Modal state
	let showClaudeCodeModal = false;
	let claudeAuthUrl = '';
	let claudeSessionId = '';
	let claudeCodeSubmitting = false;

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

	// Get current user ID
	function getCurrentUserId(): string {
		return $authStore.user?.id || 'anonymous';
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

		// Ensure the user's container is running for this repository
		try {
			const userId = getCurrentUserId();
			console.log(`Ensuring container is running for user ${userId} with repo ${currentRepoName}`);
			const containerInfo = await apiClient.ensureUserContainer(currentRepoName, userId);
			console.log('Container ready:', containerInfo);

			// Verify repository is accessible by trying to get file tree
			try {
				await apiClient.getFileTree(currentRepoName, userId);
				console.log('Repository verified and accessible');
			} catch (fileTreeError) {
				console.error('Repository not accessible, may need to be cloned:', fileTreeError);
				compileError =
					'Repository not found. Please return to home and clone the repository again.';
			}
		} catch (error) {
			console.error('Failed to ensure container is running:', error);
			compileError = 'Failed to initialize repository environment. Please try again.';
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

			// Initialize preview content
			previewContent = monacoEditor.getValue();

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
			const userId = getCurrentUserId();
			const response = await apiClient.getFileContent(currentRepoName, filePath, userId);

			if (monacoEditor) {
				// Clear any pending edits when switching files
				clearPendingEdits();
				
				monacoEditor.setValue(response.content);
				currentFilePath = filePath;
				unsavedChanges = false;
				compileError = null;
				compileSuccess = false;
				
				// Reset diff state
				originalEditorContent = '';
				previewContent = response.content;

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

	function clearPendingEdits() {
		// Remove all content widgets
		pendingEdits.forEach(edit => {
			if (edit.widgetId) {
				monacoEditor.removeContentWidget({ getId: () => edit.widgetId });
			}
		});
		
		// Clear decorations
		if (editorDecorations.length > 0) {
			monacoEditor.deltaDecorations(editorDecorations, []);
			editorDecorations = [];
		}
		
		// Clear pending edits
		pendingEdits = [];
	}

	async function handleSaveFile() {
		if (!currentRepoName || !currentFilePath || !monacoEditor) return;

		try {
			const content = monacoEditor.getValue();
			const userId = getCurrentUserId();
			await apiClient.saveFile(currentRepoName, currentFilePath, content, userId);
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

		try {
			const userId = getCurrentUserId();
			
			// If we have pending edits, save preview content temporarily for compilation
			if (pendingEdits.length > 0 && currentFilePath) {
				console.log('🎯 Compiling with preview content including pending changes');
				
				// Save the preview content (with all pending changes applied) temporarily
				await apiClient.saveFile(currentRepoName, currentFilePath, previewContent, userId);
			} else if (currentFilePath && unsavedChanges) {
				// Save current file normally if no pending edits
				await handleSaveFile();
			}

			const texFile = currentFilePath?.endsWith('.tex') ? currentFilePath : 'main.tex';
			const result = await apiClient.compileRepo(currentRepoName, userId, texFile);
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
			const userId = getCurrentUserId();
			gitStatus = await apiClient.getGitStatus(currentRepoName, userId);
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
			const userId = getCurrentUserId();
			await apiClient.commitChanges(currentRepoName, commitMessage.trim(), userId);
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
			const userId = getCurrentUserId();
			await apiClient.pushChanges(currentRepoName, userId);
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
			const userId = getCurrentUserId();
			await apiClient.fetchChanges(currentRepoName, userId);
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
			const userId = getCurrentUserId();
			await apiClient.pullChanges(currentRepoName, userId);
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

	// AI Chat functions
	async function handleAiChatMessage(event: CustomEvent<string>) {
		const userMessage = event.detail;

		if (!currentRepoName) {
			console.error('No repository selected for AI chat');
			return;
		}

		// Add user message
		aiChatMessages = [
			...aiChatMessages,
			{
				role: 'user',
				content: userMessage,
				timestamp: new Date()
			}
		];

		// Set loading state
		aiChatLoading = true;
		let currentAssistantMessageIndex = -1;

		try {
			// Call Claude AI API with streaming
			const userId = getCurrentUserId();
			
			await apiClient.sendClaudeMessageStreaming(
				currentRepoName, 
				userMessage, 
				(chunk: string) => {
					console.log('📦 Received chunk:', chunk);
					
					// Check if chunk contains tool call data
					const toolCallMatch = chunk.match(/__TOOL_CALL_START__(.+?)__TOOL_CALL_END__/);
					if (toolCallMatch) {
						console.log('🔧 Tool call detected in chunk:', chunk);
						try {
							const toolCallData = JSON.parse(toolCallMatch[1]);
							console.log('📋 Parsed tool call data:', toolCallData);
							
							// Process edit diff if this is an Edit tool call
							const editDiff = processEditToolCall(toolCallData);
							
							// If this is the first chunk or we need a new message, create one
							if (currentAssistantMessageIndex === -1) {
								aiChatMessages = [
									...aiChatMessages,
									{
										role: 'assistant',
										content: '',
										timestamp: new Date(),
										contentBlocks: [{
											type: 'tool_call',
											toolCall: {
												name: toolCallData.name,
												id: toolCallData.id,
												arguments: toolCallData.arguments,
												expanded: false,
												editDiff
											}
										}]
									}
								];
								currentAssistantMessageIndex = aiChatMessages.length - 1;
							} else {
								// Add tool call to existing message in order
								aiChatMessages = aiChatMessages.map((msg, index) => {
									if (index === currentAssistantMessageIndex) {
										const existingBlocks = msg.contentBlocks || [];
										return {
											...msg,
											contentBlocks: [...existingBlocks, {
												type: 'tool_call',
												toolCall: {
													name: toolCallData.name,
													id: toolCallData.id,
													arguments: toolCallData.arguments,
													expanded: false,
													editDiff
												}
											}]
										};
									}
									return msg;
								});
							}
						} catch (error) {
							console.error('Failed to parse tool call data:', error);
							// Fall back to treating as regular text
							processRegularChunk(chunk);
						}
					} else {
						// Regular text chunk
						processRegularChunk(chunk);
					}

					function processRegularChunk(textChunk: string) {
						// If this is the first chunk or we need a new message, create one
						if (currentAssistantMessageIndex === -1) {
							// Add new assistant message
							aiChatMessages = [
								...aiChatMessages,
								{
									role: 'assistant',
									content: textChunk,
									timestamp: new Date(),
									contentBlocks: [{
										type: 'text',
										content: textChunk
									}]
								}
							];
							currentAssistantMessageIndex = aiChatMessages.length - 1;
						} else {
							// Update the current assistant message content as chunks arrive
							aiChatMessages = aiChatMessages.map((msg, index) => {
								if (index === currentAssistantMessageIndex) {
									const existingBlocks = msg.contentBlocks || [];
									const lastBlock = existingBlocks[existingBlocks.length - 1];
									
									// If the last block is text, append to it; otherwise create new text block
									if (lastBlock && lastBlock.type === 'text') {
										const updatedBlocks = [...existingBlocks];
										updatedBlocks[updatedBlocks.length - 1] = {
											...lastBlock,
											content: (lastBlock.content || '') + textChunk
										};
										return {
											...msg,
											content: msg.content + textChunk,
											contentBlocks: updatedBlocks
										};
									} else {
										return {
											...msg,
											content: msg.content + textChunk,
											contentBlocks: [...existingBlocks, {
												type: 'text',
												content: textChunk
											}]
										};
									}
								}
								return msg;
							});
						}
					}
				},
				userId
			);
		} catch (error) {
			console.error('Claude AI error:', error);

			// Add error message
			aiChatMessages = [
				...aiChatMessages,
				{
					role: 'assistant',
					content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
					timestamp: new Date()
				}
			];
		} finally {
			aiChatLoading = false;
		}
	}

	async function handleClearAiChat() {
		aiChatMessages = [];
		
		// Clear Claude session for multi-turn conversations
		if (currentRepoName) {
			try {
				const userId = getCurrentUserId();
				const result = await apiClient.clearClaudeSession(currentRepoName, userId);
				console.log('🗑️ Cleared Claude session:', result.message);
			} catch (error) {
				console.warn('Failed to clear Claude session:', error);
				// Don't show error to user as this is not critical
			}
		}
	}

	// Debug function to test tool call detection
	function testToolCallDetection() {
		const testToolCallData = {
			name: 'Edit',
			id: 'test-123',
			arguments: {
				file_path: '/test/file.js',
				old_string: 'const old = "value";',
				new_string: 'const new = "updated";'
			}
		};
		
		const editDiff = processEditToolCall(testToolCallData);
		console.log('🧪 Test tool call result:', editDiff);
		
		// Simulate adding this to chat
		aiChatMessages = [
			...aiChatMessages,
			{
				role: 'assistant',
				content: 'Testing tool call display',
				timestamp: new Date(),
				contentBlocks: [{
					type: 'tool_call',
					toolCall: {
						name: testToolCallData.name,
						id: testToolCallData.id,
						arguments: testToolCallData.arguments,
						expanded: false,
						editDiff
					}
				}]
			}
		];
	}

	// Handle applying edit diffs to the editor
	async function handleApplyEdit(event: CustomEvent<{ messageIndex: number; blockIndex: number; editDiff: any }>) {
		const { messageIndex, blockIndex, editDiff } = event.detail;
		
		if (!monacoEditor || !editDiff) {
			console.error('Monaco editor not available or invalid edit diff');
			return;
		}
		
		try {
			// Get current editor content
			const currentContent = monacoEditor.getValue();
			
			// Store original content for reverting
			const originalContent = currentContent;
			
			// Find and replace the old string with the new string
			const newContent = currentContent.replace(editDiff.oldString, editDiff.newString);
			
			// Apply the change to the editor
			monacoEditor.setValue(newContent);
			
			// Mark as unsaved
			unsavedChanges = true;
			
			// Update the editDiff with original content for potential revert
			aiChatMessages = aiChatMessages.map((msg, msgIdx) => {
				if (msgIdx === messageIndex && msg.contentBlocks) {
					return {
						...msg,
						contentBlocks: msg.contentBlocks.map((block, blkIdx) => {
							if (blkIdx === blockIndex && block.type === 'tool_call' && block.toolCall) {
								return {
									...block,
									toolCall: {
										...block.toolCall,
										editDiff: { 
											...editDiff, 
											applied: true,
											originalContent, // Store original content for revert
											appliedContent: newContent // Store applied content for reference
										}
									}
								};
							}
							return block;
						})
					};
				}
				return msg;
			});
			
			console.log('Edit applied successfully');
		} catch (error) {
			console.error('Failed to apply edit:', error);
		}
	}

	// Handle rejecting edit diffs
	function handleRejectEdit(event: CustomEvent<{ messageIndex: number; blockIndex: number }>) {
		const { messageIndex, blockIndex } = event.detail;
		
		// Find the edit diff to check if it was applied
		const message = aiChatMessages[messageIndex];
		const block = message?.contentBlocks?.[blockIndex];
		const editDiff = block?.toolCall?.editDiff;
		
		if (!editDiff) {
			console.error('No edit diff found for rejection');
			return;
		}
		
		try {
			// If the edit was already applied, revert it
			if (editDiff.applied && editDiff.originalContent && monacoEditor) {
				console.log('Reverting applied edit to original content');
				monacoEditor.setValue(editDiff.originalContent);
				unsavedChanges = true; // Mark as unsaved since we changed content
			} else {
				console.log('Edit was not applied, just marking as rejected');
			}
			
			// Mark the edit as rejected in the UI
			aiChatMessages = aiChatMessages.map((msg, msgIdx) => {
				if (msgIdx === messageIndex && msg.contentBlocks) {
					return {
						...msg,
						contentBlocks: msg.contentBlocks.map((block, blkIdx) => {
							if (blkIdx === blockIndex && block.type === 'tool_call' && block.toolCall && block.toolCall.editDiff) {
								return {
									...block,
									toolCall: {
										...block.toolCall,
										editDiff: { 
											...block.toolCall.editDiff, 
											rejected: true,
											applied: false // Reset applied state after revert
										}
									}
								};
							}
							return block;
						})
					};
				}
				return msg;
			});
			
			console.log('Edit rejected and reverted successfully');
		} catch (error) {
			console.error('Failed to reject/revert edit:', error);
		}
	}

	// Claude Code Modal functions
	function handleClaudeCodeRequired(event: CustomEvent<{ authUrl: string; sessionId: string }>) {
		claudeAuthUrl = event.detail.authUrl;
		claudeSessionId = event.detail.sessionId;
		showClaudeCodeModal = true;
	}

	async function handleClaudeCodeSubmit(
		event: CustomEvent<{ verificationCode: string; sessionId: string }>
	) {
		const { verificationCode, sessionId } = event.detail;

		if (!currentRepoName) {
			console.error('No repository selected for Claude code verification');
			claudeCodeSubmitting = false;
			return;
		}

		claudeCodeSubmitting = true;
		console.log('🔐 Submitting Claude verification code:', verificationCode);

		try {
			const userId = getCurrentUserId();
			const result = await apiClient.verifyClaudeCode(
				currentRepoName,
				verificationCode,
				sessionId,
				userId
			);

			console.log('🔐 Claude verification result:', result);

					if (result.configured) {
			// Success - close modal and show success message
			showClaudeCodeModal = false;

			// Add success message to AI chat
			aiChatMessages = [
				...aiChatMessages,
				{
					role: 'assistant',
					content:
						'🎉 Claude AI has been successfully authenticated! You can now use AI assistance for your LaTeX projects.',
					timestamp: new Date()
				}
			];
			} else if (result.error) {
				// Error - show in AI chat and close modal to restart process
				showClaudeCodeModal = false;
				aiChatMessages = [
					...aiChatMessages,
					{
						role: 'assistant',
						content: `❌ Authentication failed: ${result.error}. Please try the setup process again.`,
						timestamp: new Date()
					}
				];
			}
		} catch (error) {
			console.error('Claude code verification error:', error);

			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			
			// Close modal and show error message
			showClaudeCodeModal = false;
			aiChatMessages = [
				...aiChatMessages,
				{
					role: 'assistant',
					content: `❌ Verification failed: ${errorMessage}. Please try the setup process again.`,
					timestamp: new Date()
				}
			];
		} finally {
			claudeCodeSubmitting = false;
		}
	}

	function handleClaudeCodeCancel() {
		showClaudeCodeModal = false;
		claudeAuthUrl = '';
		claudeSessionId = '';
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

	function startResize(
		panel: 'filetree' | 'editor-pdf' | 'git-split' | 'ai-chat',
		event: MouseEvent
	) {
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
			pdfIframes.forEach((iframe) => {
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
		} else if (resizingPanel === 'ai-chat') {
			// Calculate new height for AI chat panel within PDF column
			const pdfColumn = document.querySelector(
				'.main-content-area > div:last-child'
			) as HTMLElement;
			if (pdfColumn) {
				const rect = pdfColumn.getBoundingClientRect();
				const relativeY = newY - rect.top;
				const availableHeight = rect.height;
				const newHeight = availableHeight - relativeY;
				aiChatHeight = Math.min(Math.max(newHeight, 200), 800); // 200px to 800px range
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
		pdfIframes.forEach((iframe) => {
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

			<!-- AI Chat Toggle -->
			<button
				on:click={() => (showAiChat = !showAiChat)}
				class="text-gray-400 hover:text-white transition-colors p-2 rounded {showAiChat
					? 'bg-blue-600 text-white'
					: ''}"
				title="Toggle AI Chat"
				aria-label="Toggle AI Chat"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
					/>
				</svg>
			</button>

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
	<div class="flex-1 flex flex-col overflow-hidden main-content-wrapper">
		<div class="flex-1 flex overflow-hidden min-h-0">
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
					<FileTree
						repoName={currentRepoName}
						userId={getCurrentUserId()}
						onFileSelect={handleFileSelect}
					/>
				</div>

				<!-- Git Panel Resize Handle -->
				<button
					role="separator"
					aria-label="Resize git panel"
					class="h-1 w-full cursor-row-resize hover:bg-blue-500 bg-gray-600 transition-colors border-0 p-0"
					on:mousedown={(e) => startResize('git-split', e)}
					on:keydown={(e) => {
						if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
							e.preventDefault();
							// Keyboard resize logic can be added here
						}
					}}
				></button>

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
				<button
					role="separator"
					aria-label="Resize file tree panel"
					class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 bg-transparent transition-colors border-0 p-0"
					on:mousedown={(e) => startResize('filetree', e)}
					on:keydown={(e) => {
						if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
							e.preventDefault();
							// Keyboard resize logic can be added here
						}
					}}
				></button>
			</aside>

			<!-- Main Content Area (Editor + PDF) -->
			<div class="flex-1 flex main-content-area min-h-0" style="contain: layout style;">
				<!-- Editor -->
				{#if layoutMode === 'editor' || layoutMode === 'both'}
					<div
						class="flex flex-col {layoutMode === 'both' ? '' : 'flex-1'} min-h-0"
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

						<div class="flex-1 min-h-0">
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
					<button
						role="separator"
						aria-label="Resize editor and PDF panels"
						class="w-1 bg-gray-600 hover:bg-blue-500 cursor-col-resize transition-colors relative border-0 p-0"
						style="transform: translateZ(0); will-change: background-color;"
						on:mousedown={(e) => startResize('editor-pdf', e)}
						on:keydown={(e) => {
							if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
								e.preventDefault();
								// Keyboard resize logic can be added here
							}
						}}
					></button>
				{/if}

				<!-- PDF Preview -->
				{#if layoutMode === 'pdf' || layoutMode === 'both'}
					<div
						class="flex flex-col border-l border-gray-700 {layoutMode === 'both' ? '' : 'flex-1'} min-h-0"
						style={layoutMode === 'both'
							? `width: ${100 - editorWidth}%; transform: translateZ(0); will-change: width;`
							: 'transform: translateZ(0);'}
					>
						<div
							class="relative"
							style="flex: {showAiChat ? '1 1 auto' : '1 1 0'}; min-height: {showAiChat
								? '200px'
								: '0'};"
						>
							<PdfPreview {pdfUrl} isLoading={isCompiling} error={compileError} />
						</div>

						<!-- AI Chat Panel Resize Handle -->
						{#if showAiChat && (layoutMode === 'pdf' || layoutMode === 'both')}
							<button
								role="separator"
								aria-label="Resize AI chat panel"
								class="h-1 w-full cursor-row-resize hover:bg-blue-500 bg-gray-600 transition-colors border-0 p-0"
								on:mousedown={(e) => startResize('ai-chat', e)}
								on:keydown={(e) => {
									if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
										e.preventDefault();
										// Keyboard resize logic can be added here
									}
								}}
							></button>
						{/if}

						<!-- AI Chat Panel (now in PDF column) -->
						{#if showAiChat && (layoutMode === 'pdf' || layoutMode === 'both')}
							<div style="height: {aiChatHeight}px; flex-shrink: 0;">
								<AiChatPanel
									isVisible={true}
									bind:height={aiChatHeight}
									bind:messages={aiChatMessages}
									isLoading={aiChatLoading}
									repoName={currentRepoName || ''}
									userId={$authStore.user?.id || 'anonymous'}
									on:heightChange={(e) => (aiChatHeight = e.detail)}
									on:sendMessage={handleAiChatMessage}
									on:clearMessages={handleClearAiChat}
									on:claudeCodeRequired={handleClaudeCodeRequired}
									on:applyEdit={handleApplyEdit}
									on:rejectEdit={handleRejectEdit}
								/>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- Claude Code Modal (Full Screen) -->
<ClaudeCodeModal
	bind:isOpen={showClaudeCodeModal}
	authUrl={claudeAuthUrl}
	sessionId={claudeSessionId}
	isLoading={claudeCodeSubmitting}
	on:submit={handleClaudeCodeSubmit}
	on:cancel={handleClaudeCodeCancel}
/>

<style>
	/* Monaco Editor Diff Decorations */
	:global(.pending-edit-decoration) {
		background-color: rgba(255, 152, 0, 0.1);
		border: 1px solid rgba(255, 152, 0, 0.3);
		border-radius: 2px;
	}

	:global(.pending-edit-line-decoration) {
		background-color: rgba(255, 152, 0, 0.05);
	}

	:global(.pending-edit-margin) {
		background-color: #ff9800;
		width: 3px !important;
		margin-left: 3px;
	}

	/* Content Widget Styles */
	:global(.pending-edit-widget) {
		z-index: 1000;
		pointer-events: auto;
	}

	:global(.pending-edit-actions) {
		background: rgba(31, 41, 55, 0.95);
		border: 1px solid #4B5563;
		border-radius: 6px;
		padding: 8px 12px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		white-space: nowrap;
	}

	:global(.pending-edit-actions .apply-btn) {
		background: #10B981;
		color: white;
		border: none;
		padding: 4px 8px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 11px;
		font-weight: 500;
		transition: background-color 0.2s;
	}

	:global(.pending-edit-actions .apply-btn:hover) {
		background: #059669;
	}

	:global(.pending-edit-actions .reject-btn) {
		background: #EF4444;
		color: white;
		border: none;
		padding: 4px 8px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 11px;
		font-weight: 500;
		transition: background-color 0.2s;
	}

	:global(.pending-edit-actions .reject-btn:hover) {
		background: #DC2626;
	}

	:global(.pending-edit-actions .edit-preview) {
		color: #9CA3AF;
		font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
		font-size: 10px;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Ensure proper cursor interaction */
	:global(.monaco-editor .pending-edit-widget) {
		pointer-events: auto !important;
	}

	/* Resizing performance optimizations */
	:global(.resizing-editor-pdf) {
		cursor: col-resize !important;
	}

	:global(.resizing-editor-pdf *) {
		pointer-events: none !important;
	}

	/* Loading spinner */
	:global(.loading-spinner) {
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		border-top: 2px solid #ffffff;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}
</style>
