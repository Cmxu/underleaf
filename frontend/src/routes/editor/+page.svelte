<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import FileTree from '$components/FileTree.svelte';
	import PdfPreview from '$components/PdfPreview.svelte';
	import AiChatPanel from '$components/AiChatPanel.svelte';
	import ClaudeCodeModal from '$components/ClaudeCodeModal.svelte';
	import ProjectSettingsModal from '$components/ProjectSettingsModal.svelte';
	import CommentsPanel from '$components/CommentsPanel.svelte';
	import CommentModal from '$components/CommentModal.svelte';
	import { apiClient } from '$lib/utils/api';
	import { authStore } from '$lib/stores/auth';
	import { commentsService, commentsStore, setupAutoSave, type Comment } from '$lib/stores/comments';
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
	function processEditToolCall(toolCall: { name: string; arguments: any; id?: string }) {
		console.log('🔍 Processing tool call:', toolCall);
		
		if (toolCall.name === 'Edit' && toolCall.arguments.file_path && toolCall.arguments.old_string && toolCall.arguments.new_string) {
			console.log('✅ Edit tool call detected!', {
				file_path: toolCall.arguments.file_path,
				old_string: toolCall.arguments.old_string?.substring(0, 50) + '...',
				new_string: toolCall.arguments.new_string?.substring(0, 50) + '...',
				current_file: currentFilePath,
				has_editor: !!monacoEditor
			});
			
			try {
				// Check if this edit is for the currently open file
				if (currentFilePath && toolCall.arguments.file_path === currentFilePath && monacoEditor) {
					console.log('🎯 Processing edit for currently open file:', currentFilePath);
					const currentContent = monacoEditor.getValue();
					const range = findChangeRange(currentContent, toolCall.arguments.old_string, toolCall.arguments.new_string);
					
					console.log('📍 Found range:', range);
					
					if (range) {
						// Generate a unique ID if not provided
						const editId = toolCall.id || `edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
						
						console.log('➕ Adding pending edit with ID:', editId);
						
						// Add to pending edits for in-editor display
						addPendingEdit({
							id: editId,
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
					} else {
						console.log('⚠️ Could not find range for edit in current file');
					}
				} else {
					console.log('ℹ️ Edit is for different file or editor not available:', {
						editFile: toolCall.arguments.file_path,
						currentFile: currentFilePath,
						hasEditor: !!monacoEditor
					});
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
				
				console.log('🎯 Created fallback edit diff:', result);
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
		console.log('📝 Adding pending edit for file:', edit.filePath || currentFilePath);
		
		const filePath = edit.filePath || currentFilePath;
		if (!filePath) {
			console.error('❌ Cannot add edit without file path');
			return;
		}
		
		// Add to global pending edits
		const fileEdits = globalPendingEdits.get(filePath) || [];
		const editWithFilePath = { ...edit, filePath };
		globalPendingEdits.set(filePath, [...fileEdits, editWithFilePath]);
		
		// If this edit is for the currently open file, also add to local pending edits
		if (filePath === currentFilePath) {
			pendingEdits = [...pendingEdits, edit];
			updateEditorDecorations();
		}
		
		console.log('📝 Global pending edits:', globalPendingEdits.size, 'files affected');
		console.log('📝 Current file pending edits:', pendingEdits.length);
	}

	function updateEditorDecorations() {
		console.log('🎨 Updating editor decorations, pending edits:', pendingEdits.length);
		
		if (!monacoEditor || !monaco) {
			console.log('⚠️ No monaco editor or monaco instance available');
			return;
		}

		// Clear existing decorations
		if (editorDecorations.length > 0) {
			console.log('🧹 Clearing existing decorations:', editorDecorations.length);
			monacoEditor.deltaDecorations(editorDecorations, []);
			editorDecorations = [];
		}

		// Add decorations for each pending edit
		const decorations: any[] = [];
		
		pendingEdits.forEach((edit, index) => {
			console.log(`🎯 Processing edit ${index + 1}:`, edit);
			
			if (!edit.applied) {
				// Highlight the range that will be changed with stronger visual indicators
				decorations.push({
					range: new monaco.Range(edit.range.startLine, edit.range.startColumn, edit.range.endLine, edit.range.endColumn),
					options: {
						className: 'pending-edit-decoration',
						hoverMessage: { value: `**Pending Change ${index + 1}**\n\nCurrent: \`${edit.oldString}\`\n\nProposed: \`${edit.newString}\`\n\nClick Apply/Reject buttons above this line.` },
						minimap: {
							color: '#ff9800',
							position: monaco.editor.MinimapPosition.Inline
						},
						overviewRuler: {
							color: '#ff9800',
							position: monaco.editor.OverviewRulerLane.Right
						},
						glyphMarginClassName: 'pending-edit-glyph',
						glyphMarginHoverMessage: { value: 'Pending AI Edit' }
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

				// Add an overlay decoration to show the proposed change
				decorations.push({
					range: new monaco.Range(edit.range.startLine, edit.range.startColumn, edit.range.endLine, edit.range.endColumn),
					options: {
						afterContentClassName: 'pending-edit-after-content',
						after: {
							content: ` → ${edit.newString}`,
							color: '#4ade80',
							fontStyle: 'italic'
						}
					}
				});
			}
		});

		console.log('🎨 Created decorations:', decorations.length);

		if (decorations.length > 0) {
			editorDecorations = monacoEditor.deltaDecorations([], decorations);
			console.log('✅ Applied decorations:', editorDecorations.length);
		}

		// Add content widgets for action buttons
		addActionWidgets();
		
		// Force a visual refresh
		setTimeout(() => {
			if (monacoEditor) {
				monacoEditor.revealLineInCenter(pendingEdits[0]?.range?.startLine || 1);
			}
		}, 100);
	}

	function addActionWidgets() {
		console.log('🪄 Adding action widgets for pending edits:', pendingEdits.length);
		
		if (!monacoEditor || !monaco) {
			console.log('⚠️ No monaco editor or monaco instance available for widgets');
			return;
		}

		pendingEdits.forEach((edit, index) => {
			console.log(`🪄 Processing widget for edit ${index + 1}:`, { applied: edit.applied, hasWidget: !!edit.widgetId });
			
			if (!edit.applied && !edit.widgetId) {
				const widgetId = `pending-edit-widget-${edit.id}`;
				console.log('🪄 Creating widget with ID:', widgetId);
				
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
						
						applyBtn?.addEventListener('click', () => {
							console.log('🟢 Apply button clicked for edit:', edit.id);
							applyPendingEdit(edit.id);
						});
						rejectBtn?.addEventListener('click', () => {
							console.log('🔴 Reject button clicked for edit:', edit.id);
							rejectPendingEdit(edit.id);
						});
						
						console.log('🪄 Created widget DOM node:', domNode);
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
				console.log('✅ Added content widget:', widgetId);
			}
		});
	}

	function updatePreviewContentForFile(filePath: string, baseContent?: string) {
		if (!filePath) return;
		
		// Use provided base content or get from original store
		let content = baseContent || originalFileContents.get(filePath) || '';
		if (!content && filePath === currentFilePath && monacoEditor) {
			content = monacoEditor.getValue();
		}
		
		// Apply all pending edits for this file to create preview
		const fileEdits = globalPendingEdits.get(filePath) || [];
		fileEdits.forEach(edit => {
			if (!edit.applied) {
				content = content.replace(edit.oldString, edit.newString);
			}
		});
		
		previewFileContents.set(filePath, content);
		console.log('📄 Updated preview content for', filePath, ', length:', content.length);
		
		// Force Monaco editor to refresh its view if this is the current file
		if (filePath === currentFilePath && monacoEditor) {
			setTimeout(() => {
				monacoEditor.layout();
				monacoEditor.getAction('editor.action.refreshDecorations')?.run();
			}, 10);
		}
	}

	// Legacy function for current file
	function updatePreviewContent() {
		if (!currentFilePath) return;
		updatePreviewContentForFile(currentFilePath);
	}

	function applyPendingEdit(editId: string) {
		const editIndex = pendingEdits.findIndex(e => e.id === editId);
		if (editIndex === -1 || !currentFilePath) return;

		const edit = pendingEdits[editIndex];
		
		// Apply the change to the editor
		const currentContent = monacoEditor.getValue();
		const newContent = currentContent.replace(edit.oldString, edit.newString);
		
		// Store original content if this is the first edit for this file
		if (!originalFileContents.has(currentFilePath)) {
			originalFileContents.set(currentFilePath, currentContent);
		}
		
		monacoEditor.setValue(newContent);
		
		// Mark as applied in both local and global state
		edit.applied = true;
		
		// Update global state
		const globalFileEdits = globalPendingEdits.get(currentFilePath) || [];
		const globalEditIndex = globalFileEdits.findIndex(e => e.id === editId);
		if (globalEditIndex !== -1) {
			globalFileEdits[globalEditIndex].applied = true;
			globalPendingEdits.set(currentFilePath, globalFileEdits);
		}
		
		// Remove from local pending edits
		pendingEdits = pendingEdits.filter(e => e.id !== editId);
		
		// Remove the widget
		if (edit.widgetId) {
			monacoEditor.removeContentWidget({ getId: () => edit.widgetId });
		}
		
		// Update decorations and preview
		updateEditorDecorations();
		updatePreviewContentForFile(currentFilePath);
		
		// Mark as unsaved
		unsavedChanges = true;
		
		console.log('Applied edit:', editId, 'for file:', currentFilePath);
	}

	function rejectPendingEdit(editId: string) {
		const editIndex = pendingEdits.findIndex(e => e.id === editId);
		if (editIndex === -1 || !currentFilePath) return;

		const edit = pendingEdits[editIndex];
		
		// Remove from local pending edits
		pendingEdits = pendingEdits.filter(e => e.id !== editId);
		
		// Remove from global state
		const globalFileEdits = globalPendingEdits.get(currentFilePath) || [];
		const updatedGlobalEdits = globalFileEdits.filter(e => e.id !== editId);
		if (updatedGlobalEdits.length > 0) {
			globalPendingEdits.set(currentFilePath, updatedGlobalEdits);
		} else {
			globalPendingEdits.delete(currentFilePath);
		}
		
		// Remove the widget
		if (edit.widgetId) {
			monacoEditor.removeContentWidget({ getId: () => edit.widgetId });
		}
		
		// Update decorations and preview
		updateEditorDecorations();
		updatePreviewContentForFile(currentFilePath);
		
		console.log('Rejected edit:', editId, 'for file:', currentFilePath);
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

	// Global diff state - tracks pending edits for ALL files
	let globalPendingEdits: Map<string, Array<{
		id: string;
		range: any;
		oldString: string;
		newString: string;
		applied: boolean;
		decorationIds: string[];
		widgetId?: string;
		filePath: string;
	}>> = new Map();
	
	// Current file specific state
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
	let originalFileContents: Map<string, string> = new Map(); // Store original content per file
	let previewFileContents: Map<string, string> = new Map(); // Store preview content per file

	// Layout state - now using separate toggles for each panel
	let showEditor = true;
	let showComments = false;
	let showPdf = true;
	let fileTreeWidth = 256; // 16rem in pixels
	
	// Panel widths for resizable columns (percentages)
	let editorPanelWidth = 40; // percentage for editor panel
	let commentsPanelWidth = 30; // percentage for comments panel
	let pdfPanelWidth = 30; // percentage for PDF panel
	
	let isResizing = false;
	let resizingPanel: 'filetree' | 'editor-pdf' | 'git-split' | 'ai-chat' | 'editor-comments' | 'comments-pdf' | null = null;
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

	// Project Settings Modal state
	let showProjectSettingsModal = false;
	let projectSettings = {
		mainDocument: null as string | null,
		compileOptions: {
			engine: 'pdflatex',
			outputDirectory: 'build'
		},
		version: '1.0'
	};

	// Comment Modal state
	let showCommentModal = false;
	let commentModalSelectedText = '';
	let commentModalSelection: any = null;

	// FileTree component reference
	let fileTreeComponent: any = null;

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
	$: if (monacoEditor && showEditor) {
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

	// Load project settings
	async function loadProjectSettings() {
		if (!currentRepoName) return;

		try {
			const userId = getCurrentUserId();
			const settings = await apiClient.getProjectSettings(currentRepoName, userId);
			projectSettings = settings;
		} catch (error) {
			console.error('Failed to load project settings:', error);
			// Keep default settings if loading fails
		}
	}

	// Check if current file is the main document
	function isCurrentFileMainDocument(): boolean {
		if (!currentFilePath || !projectSettings.mainDocument) return false;
		return currentFilePath === projectSettings.mainDocument;
	}

	// Check if current file is a .tex file
	function isCurrentFileTexFile(): boolean {
		return currentFilePath?.endsWith('.tex') || false;
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

		// Load project settings
		await loadProjectSettings();

		// Automatically open main document if it exists, otherwise show welcome message
		await autoOpenMainDocument();

		// Load comments for this repository
		if (currentRepoName) {
			// Try to load from backend first (for AI sync), then fallback to localStorage
			try {
				await commentsService.loadCommentsFromBackend(currentRepoName, getCurrentUserId());
			} catch (error) {
				console.warn('Failed to load comments from backend, loading from localStorage:', error);
				commentsService.loadComments(currentRepoName);
			}
			
			// Clean up any invalid comments that might exist
			commentsService.cleanupInvalidComments();
			
			setupAutoSave(currentRepoName);
			
			// Start real-time polling for AI-generated comments
			commentsService.startPolling(currentRepoName, getCurrentUserId());
		}

		// Load git status on mount
		await handleRefreshGitStatus();
	});

	// Clean up subscriptions when component is destroyed
	onDestroy(() => {
		if (commentHighlightingUnsubscribe) {
			commentHighlightingUnsubscribe();
		}
		// Stop comment polling when component is destroyed
		commentsService.stopPolling();
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
				value: '', // Start with empty editor instead of welcome message
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

			// Add comment creation keybinding (Ctrl/Cmd + M)
			monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyM, () => {
				handleCreateComment();
			});

			// Add context menu action for creating comments
			monacoEditor.addAction({
				id: 'add-comment',
				label: 'Add Comment',
				keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyM],
				contextMenuGroupId: 'navigation',
				contextMenuOrder: 1.5,
				run: () => {
					handleCreateComment();
				}
			});

			// Highlight comments in the editor
			setupCommentHighlighting();

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

	/**
	 * Automatically open the main document if it exists, otherwise show welcome message
	 */
	async function autoOpenMainDocument() {
		if (!currentRepoName) {
			showWelcomeMessage();
			return;
		}

		// First check if we have a configured main document
		if (projectSettings.mainDocument) {
			try {
				// Try to open the configured main document
				await handleFileSelect(projectSettings.mainDocument);
				console.log(`Automatically opened configured main document: ${projectSettings.mainDocument}`);
				return;
			} catch (error) {
				console.warn(`Failed to open configured main document ${projectSettings.mainDocument}:`, error);
				// Continue to auto-detection if configured document fails
			}
		}

		// Try to auto-detect main document if none is configured
		try {
			const userId = getCurrentUserId();
			const result = await apiClient.detectMainDocument(currentRepoName, userId);
			
			if (result.mainDocument) {
				// Update project settings with detected main document
				projectSettings.mainDocument = result.mainDocument;
				await apiClient.saveProjectSettings(currentRepoName, projectSettings, userId);
				
				// Open the detected main document
				await handleFileSelect(result.mainDocument);
				console.log(`Automatically opened detected main document: ${result.mainDocument}`);
				return;
			}
		} catch (error) {
			console.warn('Failed to auto-detect main document:', error);
		}

		// No main document found, show welcome message
		showWelcomeMessage();
	}

	/**
	 * Show welcome message when no main document is available
	 */
	function showWelcomeMessage() {
		if (!monacoEditor) return;

		const welcomeMessage = `% Welcome to Underleaf!
% Select a file from the file tree to start editing

\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath}
\\usepackage{amsfonts}
\\usepackage{amssymb}
\\usepackage{graphicx}

\\title{Your Document Title}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}

Your content here...

\\end{document}`;

		monacoEditor.setValue(welcomeMessage);
		monacoEditor.setModelLanguage(monacoEditor.getModel(), 'latex');
		
		// Set current file path to indicate we're showing welcome message
		currentFilePath = null;
		unsavedChanges = false;
		
		// Clear file tree selection to reflect no file is selected
		if (fileTreeComponent) {
			fileTreeComponent.updateSelectedFile(null);
		}
		
		console.log('Showing welcome message - no main document found');
	}

	async function handleFileSelect(filePath: string) {
		if (!currentRepoName) return;

		try {
			const userId = getCurrentUserId();
			const response = await apiClient.getFileContent(currentRepoName, filePath, userId);

			if (monacoEditor) {
				const previousFilePath = currentFilePath;
				
				// Save current file state if switching files
				if (previousFilePath && previousFilePath !== filePath) {
					console.log('💾 Saving state for file:', previousFilePath);
					savePendingEditsForFile(previousFilePath);
					clearCurrentFileDecorations();
				}
				
				monacoEditor.setValue(response.content);
				currentFilePath = filePath;
				unsavedChanges = false;
				compileError = null;
				compileSuccess = false;
				
				// Load pending edits for this file
				loadPendingEditsForFile(filePath, response.content);

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
				
				// Restore decorations if we have pending edits for this file
				setTimeout(() => {
					console.log('🔄 Restoring decorations after file load, pending edits:', pendingEdits.length);
					if (pendingEdits.length > 0) {
						updateEditorDecorations();
					}
					// Update comment highlighting for the new file
					setupCommentHighlighting();
				}, 100);
			}
		} catch (err) {
			compileError = err instanceof Error ? err.message : 'Failed to load file';
		}
	}

	// Save current file's pending edits state
	function savePendingEditsForFile(filePath: string) {
		if (!filePath) return;
		
		console.log('💾 Saving pending edits state for:', filePath);
		
		// Update global store with current state
		if (pendingEdits.length > 0) {
			const editsWithFilePath = pendingEdits.map(edit => ({ ...edit, filePath }));
			globalPendingEdits.set(filePath, editsWithFilePath);
		}
	}

	// Load pending edits for a specific file
	function loadPendingEditsForFile(filePath: string, fileContent: string) {
		if (!filePath) return;
		
		console.log('📂 Loading pending edits for:', filePath);
		
		// Load from global store
		const fileEdits = globalPendingEdits.get(filePath) || [];
		pendingEdits = fileEdits.map(edit => {
			// Remove filePath for local usage and reset widget/decoration IDs
			const { filePath: _, ...localEdit } = edit;
			return {
				...localEdit,
				decorationIds: [],
				widgetId: undefined
			};
		});
		
		// Store original content if we have pending edits
		if (pendingEdits.length > 0) {
			if (!originalFileContents.has(filePath)) {
				originalFileContents.set(filePath, fileContent);
			}
			updatePreviewContentForFile(filePath, fileContent);
		} else {
			// No pending edits, preview content is same as file content
			previewFileContents.set(filePath, fileContent);
		}
		
		console.log('📂 Loaded', pendingEdits.length, 'pending edits for', filePath);
	}

	// Clear current file decorations without affecting global state
	function clearCurrentFileDecorations() {
		// Remove all content widgets
		pendingEdits.forEach(edit => {
			if (edit.widgetId) {
				monacoEditor?.removeContentWidget({ getId: () => edit.widgetId });
			}
		});
		
		// Clear decorations
		if (editorDecorations.length > 0) {
			monacoEditor?.deltaDecorations(editorDecorations, []);
			editorDecorations = [];
		}
		
		// Clear local pending edits (global state preserved)
		pendingEdits = [];
	}

	// Clear all pending edits (global reset)
	function clearAllPendingEdits() {
		clearCurrentFileDecorations();
		globalPendingEdits.clear();
		originalFileContents.clear();
		previewFileContents.clear();
		console.log('🧹 Cleared all pending edits globally');
	}

	// Legacy function for backward compatibility
	function clearPendingEdits() {
		clearCurrentFileDecorations();
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

	async function handleCompile(compileMain = false) {
		if (!currentRepoName) return;

		isCompiling = true;
		compileError = null;
		compileSuccess = false;

		try {
			const userId = getCurrentUserId();
			
			// Determine which file to compile
			let texFileToCompile: string;
			
			if (compileMain && projectSettings.mainDocument) {
				// Compile the main document
				texFileToCompile = projectSettings.mainDocument;
			} else if (currentFilePath?.endsWith('.tex')) {
				// Compile the current file
				texFileToCompile = currentFilePath;
			} else {
				// Default fallback
				texFileToCompile = projectSettings.mainDocument || 'main.tex';
			}
			
			// Save preview content for all files with pending edits for compilation
			if (globalPendingEdits.size > 0) {
				console.log('🎯 Compiling with preview content including pending changes for', globalPendingEdits.size, 'files');
				
				// Save preview content for all files with pending edits
				for (const [filePath, fileEdits] of globalPendingEdits.entries()) {
					const unappliedEdits = fileEdits.filter(edit => !edit.applied);
					if (unappliedEdits.length > 0) {
						const previewContent = previewFileContents.get(filePath);
						if (previewContent) {
							console.log('📄 Saving preview content for', filePath, 'with', unappliedEdits.length, 'pending edits');
							await apiClient.saveFile(currentRepoName, filePath, previewContent, userId);
						}
					}
				}
				
				// Also save current file if it has unsaved changes
				if (currentFilePath && unsavedChanges && !globalPendingEdits.has(currentFilePath)) {
					await handleSaveFile();
				}
			} else if (currentFilePath && unsavedChanges) {
				// Save current file normally if no pending edits anywhere
				await handleSaveFile();
			}

			const result = await apiClient.compileRepo(currentRepoName, userId, texFileToCompile);
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

	// Wrapper functions for button clicks
	function handleCompileCurrent() {
		handleCompile(false);
	}

	function handleCompileMain() {
		handleCompile(true);
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

	// Debug function to test in-editor diff system
	function testInEditorDiff() {
		if (!monacoEditor || !currentFilePath) {
			console.log('⚠️ Cannot test: no editor or file loaded');
			return;
		}
		
		const currentContent = monacoEditor.getValue();
		console.log('🧪 Testing in-editor diff with current content length:', currentContent.length);
		
		// Find a line to modify for testing
		const lines = currentContent.split('\n');
		if (lines.length < 5) {
			console.log('⚠️ Not enough content to test');
			return;
		}
		
		// Take the first non-empty line and create a test edit
		const testLineIndex = lines.findIndex((line: string) => line.trim().length > 0);
		if (testLineIndex === -1) {
			console.log('⚠️ No non-empty lines found');
			return;
		}
		
		const testLine = lines[testLineIndex];
		const testOldString = testLine;
		const testNewString = testLine + ' ← AI SUGGESTED CHANGE';
		
		console.log('🧪 Test edit:', { testOldString, testNewString });
		
		const testToolCallData = {
			name: 'Edit',
			id: 'test-' + Date.now(),
			arguments: {
				file_path: currentFilePath,
				old_string: testOldString,
				new_string: testNewString
			}
		};
		
		console.log('🧪 Processing test tool call...');
		const editDiff = processEditToolCall(testToolCallData);
		console.log('🧪 Test result:', editDiff);
	}

	// Debug function to test tool call detection (fallback)
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

	// Expose test function to window for debugging
	if (typeof window !== 'undefined') {
		(window as any).testInEditorDiff = testInEditorDiff;
		(window as any).testToolCallDetection = testToolCallDetection;
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

	// Project Settings Modal functions
	function handleShowProjectSettings() {
		showProjectSettingsModal = true;
	}

	function handleCloseProjectSettings() {
		showProjectSettingsModal = false;
	}

	async function handleSaveProjectSettings(event: CustomEvent<{ settings: any }>) {
		const { settings } = event.detail;
		projectSettings = settings;
		
		// Reload settings to ensure consistency
		await loadProjectSettings();
		
		console.log('Project settings saved:', settings);
	}



	// Layout functions
	function toggleEditor() {
		showEditor = !showEditor;
		// If switching to show editor after it was hidden, recreate the editor
		if (showEditor && monacoEditor) {
			console.log('Switching to show editor, recreating editor...');

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

					// Re-add comment functionality
					monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyM, () => {
						handleCreateComment();
					});

					monacoEditor.addAction({
						id: 'add-comment',
						label: 'Add Comment',
						keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyM],
						contextMenuGroupId: 'navigation',
						contextMenuOrder: 1.5,
						run: () => {
							handleCreateComment();
						}
					});

					// Re-setup comment highlighting
					setupCommentHighlighting();

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

	function toggleComments() {
		showComments = !showComments;
	}

	function togglePdf() {
		showPdf = !showPdf;
	}

	// Calculate the number of visible panels for layout purposes
	$: visiblePanels = [showEditor, showComments, showPdf].filter(Boolean).length;

	// Calculate panel widths based on visibility and user preferences
	$: panelWidths = (() => {
		if (visiblePanels === 1) {
			// Single panel takes full width
			if (showEditor) return { editor: 100, comments: 0, pdf: 0 };
			if (showComments) return { editor: 0, comments: 100, pdf: 0 };
			if (showPdf) return { editor: 0, comments: 0, pdf: 100 };
		} else if (visiblePanels === 2) {
			// Two panels - distribute remaining space
			if (showEditor && showComments) {
				return { editor: editorPanelWidth, comments: 100 - editorPanelWidth, pdf: 0 };
			} else if (showEditor && showPdf) {
				return { editor: editorPanelWidth, comments: 0, pdf: 100 - editorPanelWidth };
			} else if (showComments && showPdf) {
				return { editor: 0, comments: commentsPanelWidth, pdf: 100 - commentsPanelWidth };
			}
		} else if (visiblePanels === 3) {
			// Three panels - use all three widths
			return { editor: editorPanelWidth, comments: commentsPanelWidth, pdf: pdfPanelWidth };
		}
		
		// Fallback to equal distribution
		return { editor: 100 / visiblePanels, comments: 100 / visiblePanels, pdf: 100 / visiblePanels };
	})();

	// Comment functions
	function handleNavigateToComment(event: CustomEvent<Comment>) {
		const comment = event.detail;
		
		// Validate the comment file path before attempting navigation
		if (!commentsService.validateFilePath(comment.fileName)) {
			console.error('Invalid file path in comment:', comment.fileName);
			compileError = `Cannot navigate to comment: Invalid file path "${comment.fileName}". This comment may have been created with an invalid path.`;
			return;
		}
		
		commentsService.setActiveComment(comment);
		
		// Navigate to the file if it's different from current
		if (comment.fileName !== currentFilePath) {
			handleFileSelect(comment.fileName);
			
			// Update file tree selection to highlight the current file
			if (fileTreeComponent) {
				fileTreeComponent.updateSelectedFile(comment.fileName);
			}
		}
		
		// Wait for file to load, then navigate to line
		setTimeout(() => {
			if (monacoEditor) {
				monacoEditor.revealLineInCenter(comment.startLine);
				monacoEditor.setPosition({ lineNumber: comment.startLine, column: comment.startColumn });
				monacoEditor.focus();
			}
		}, 100);
	}

	function handleDeleteComment(event: CustomEvent<string>) {
		const commentId = event.detail;
		commentsService.deleteComment(commentId);
		// Note: Comment highlighting will be automatically updated through the store subscription
	}

	function handleCreateComment() {
		if (!monacoEditor || !currentFilePath) {
			// Could show a toast notification here instead of alert
			console.warn('Please select a file and some text to add a comment.');
			return;
		}

		const selection = monacoEditor.getSelection();
		if (!selection || selection.isEmpty()) {
			// Could show a toast notification here instead of alert
			console.warn('Please select some text to add a comment.');
			return;
		}

		// Store selection data and show modal
		commentModalSelection = selection;
		commentModalSelectedText = monacoEditor.getModel()?.getValueInRange(selection) || '';
		showCommentModal = true;
	}

	function handleCommentModalSave(event: CustomEvent<{ content: string; editingComment: Comment | null }>) {
		const { content } = event.detail;
		
		if (commentModalSelection && currentFilePath) {
			commentsService.addComment({
				fileName: currentFilePath,
				startLine: commentModalSelection.startLineNumber,
				startColumn: commentModalSelection.startColumn,
				endLine: commentModalSelection.endLineNumber,
				endColumn: commentModalSelection.endColumn,
				selectedText: commentModalSelectedText,
				content: content,
				author: $authStore.user?.email || 'Anonymous'
			});
		}
		
		// Close modal and reset state
		showCommentModal = false;
		commentModalSelection = null;
		commentModalSelectedText = '';
	}

	function handleCommentModalCancel() {
		showCommentModal = false;
		commentModalSelection = null;
		commentModalSelectedText = '';
	}

	// Setup comment highlighting in Monaco editor
	let commentDecorationIds: string[] = [];
	let commentHighlightingUnsubscribe: (() => void) | null = null;
	
	function setupCommentHighlighting() {
		if (!monacoEditor) return;

		// Clear existing subscription to avoid memory leaks
		if (commentHighlightingUnsubscribe) {
			commentHighlightingUnsubscribe();
		}

		// Subscribe to comments store to update highlights when comments change
		commentHighlightingUnsubscribe = commentsStore.subscribe((state) => {
			if (!monacoEditor || !currentFilePath) return;

			// Filter comments for current file
			const fileComments = state.comments.filter(c => c.fileName === currentFilePath);
			
			// Create decorations for each comment
			const decorations = fileComments.map(comment => ({
				range: new monaco.Range(
					comment.startLine, 
					comment.startColumn, 
					comment.endLine, 
					comment.endColumn
				),
				options: {
					className: 'comment-highlight',
					hoverMessage: { value: `💬 **${comment.author}**: ${comment.content}` },
					minimap: {
						color: '#ffeb3b',
						position: 2 // monaco.editor.MinimapPosition.Inline
					},
					overviewRuler: {
						color: '#ffeb3b',
						position: 4 // monaco.editor.OverviewRulerLane.Right
					},
					stickiness: 1 // monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
				}
			}));

			// Apply decorations, properly replacing previous ones
			commentDecorationIds = monacoEditor.deltaDecorations(commentDecorationIds, decorations);
		});
	}

	// Function to clear comment highlighting
	function clearCommentHighlighting() {
		if (monacoEditor && commentDecorationIds.length > 0) {
			commentDecorationIds = monacoEditor.deltaDecorations(commentDecorationIds, []);
		}
	}

	// Performance-optimized resize functions with GPU acceleration
	let rafId: number | null = null;
	let pendingResizeEvent: MouseEvent | null = null;

	function startResize(
		panel: 'filetree' | 'editor-pdf' | 'git-split' | 'ai-chat' | 'editor-comments' | 'comments-pdf',
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
				editorPanelWidth = newWidth;
			}
		} else if (resizingPanel === 'editor-comments') {
			// Resize between editor and comments panels
			const mainArea = document.querySelector('.main-content-area') as HTMLElement;
			if (mainArea) {
				const rect = mainArea.getBoundingClientRect();
				if (rect.width <= 0) return;

				const relativeX = newX - rect.left;
				const percentage = (relativeX / rect.width) * 100;
				const newWidth = Math.min(Math.max(percentage, 25), 70); // 25% to 70% range

				editorPanelWidth = newWidth;
				// Adjust other panels proportionally
				const remainingWidth = 100 - newWidth;
				if (showComments && showPdf) {
					commentsPanelWidth = remainingWidth * 0.4;
					pdfPanelWidth = remainingWidth * 0.6;
				} else if (showComments) {
					commentsPanelWidth = remainingWidth;
				} else if (showPdf) {
					pdfPanelWidth = remainingWidth;
				}
			}
		} else if (resizingPanel === 'comments-pdf') {
			// Resize between comments and PDF panels
			const mainArea = document.querySelector('.main-content-area') as HTMLElement;
			if (mainArea) {
				const rect = mainArea.getBoundingClientRect();
				if (rect.width <= 0) return;

				const relativeX = newX - rect.left;
				const percentage = (relativeX / rect.width) * 100;
				
				// Calculate the position relative to the start of the comments panel
				const editorWidth = editorPanelWidth;
				const commentsStart = (editorWidth / 100) * rect.width;
				const relativeToComments = newX - rect.left - commentsStart;
				const commentsPercentage = (relativeToComments / rect.width) * 100;
				
				const newCommentsWidth = Math.min(Math.max(commentsPercentage, 15), 60); // 15% to 60% range
				commentsPanelWidth = newCommentsWidth;
				
				// Adjust PDF panel width
				const remainingWidth = 100 - editorWidth - newCommentsWidth;
				pdfPanelWidth = Math.max(remainingWidth, 20); // Ensure PDF has at least 20%
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
					on:click={toggleEditor}
					class="px-3 py-1.5 text-xs rounded transition-colors {showEditor
						? 'bg-blue-600 text-white'
						: 'text-gray-400 hover:text-white hover:bg-gray-600'}"
					title="Toggle Editor"
				>
					Editor
				</button>
				<button
					on:click={toggleComments}
					class="px-3 py-1.5 text-xs rounded transition-colors {showComments
						? 'bg-blue-600 text-white'
						: 'text-gray-400 hover:text-white hover:bg-gray-600'}"
					title="Toggle Comments"
				>
					Comments
				</button>
				<button
					on:click={togglePdf}
					class="px-3 py-1.5 text-xs rounded transition-colors {showPdf
						? 'bg-blue-600 text-white'
						: 'text-gray-400 hover:text-white hover:bg-gray-600'}"
					title="Toggle PDF"
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

			<!-- Dynamic compile button based on current file and main document settings -->
			{#if isCurrentFileTexFile() && !isCurrentFileMainDocument() && projectSettings.mainDocument}
				<!-- Split button for .tex files that are not the main document -->
				<div class="flex">
					<button
						on:click={handleCompileCurrent}
						disabled={isCompiling || !currentRepoName}
						class="btn-primary px-4 py-2 text-sm disabled:opacity-50 rounded-r-none border-r border-blue-700"
					>
						{#if isCompiling}
							<div class="flex items-center space-x-2">
								<div class="loading-spinner w-4 h-4"></div>
								<span>Compiling...</span>
							</div>
						{:else}
							Compile Current
						{/if}
					</button>
					<button
						on:click={handleCompileMain}
						disabled={isCompiling || !currentRepoName}
						class="btn-primary px-4 py-2 text-sm disabled:opacity-50 rounded-l-none"
					>
						{#if isCompiling}
							<div class="flex items-center space-x-2">
								<div class="loading-spinner w-4 h-4"></div>
								<span>Compiling...</span>
							</div>
						{:else}
							Compile Main
						{/if}
					</button>
				</div>
			{:else}
				<!-- Single compile button -->
				<button
					on:click={handleCompileCurrent}
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
			{/if}


			<!-- Settings button -->
			<button
				on:click={handleShowProjectSettings}
				class="text-gray-400 hover:text-white transition-colors p-2 rounded"
				title="Project Settings"
				aria-label="Project Settings"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
					/>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
					/>
				</svg>
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
						bind:this={fileTreeComponent}
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
				{#if showEditor}
					<div
						class="flex flex-col min-h-0 relative"
						style="width: {panelWidths.editor}%; transform: translateZ(0); will-change: width;"
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

				<!-- Resize Handle between Editor and Comments -->
				{#if showEditor && showComments}
					<button
						role="separator"
						aria-label="Resize editor and comments panels"
						class="w-1 bg-gray-600 cursor-col-resize flex-shrink-0 panel-resize-handle"
						on:mousedown={(e) => startResize('editor-comments', e)}
						on:keydown={(e) => {
							if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
								e.preventDefault();
								// Keyboard resize logic can be added here
							}
						}}
					></button>
				{/if}

				<!-- Comments Panel -->
				{#if showComments}
					<div
						class="flex flex-col min-h-0 relative"
						style="width: {panelWidths.comments}%; transform: translateZ(0); will-change: width;"
					>
											<CommentsPanel
						repoName={currentRepoName || ''}
						userId={getCurrentUserId()}
						on:navigateToComment={handleNavigateToComment}
						on:deleteComment={handleDeleteComment}
						on:createComment={handleCreateComment}
					/>
					</div>
				{/if}

				<!-- Resize Handle between Comments and PDF -->
				{#if showComments && showPdf}
					<button
						role="separator"
						aria-label="Resize comments and PDF panels"
						class="w-1 bg-gray-600 cursor-col-resize flex-shrink-0 panel-resize-handle"
						on:mousedown={(e) => startResize('comments-pdf', e)}
						on:keydown={(e) => {
							if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
								e.preventDefault();
								// Keyboard resize logic can be added here
							}
						}}
					></button>
				{/if}

				<!-- Resize Handle between Editor and PDF (when comments are hidden) -->
				{#if showEditor && showPdf && !showComments}
					<button
						role="separator"
						aria-label="Resize editor and PDF panels"
						class="w-1 bg-gray-600 cursor-col-resize flex-shrink-0 panel-resize-handle"
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
				{#if showPdf}
					<div
						class="flex flex-col border-l border-gray-700 min-h-0 relative"
						style="width: {panelWidths.pdf}%; transform: translateZ(0); will-change: width;"
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
						{#if showAiChat && showPdf}
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
						{#if showAiChat && showPdf}
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

<!-- Project Settings Modal -->
<ProjectSettingsModal
	bind:isOpen={showProjectSettingsModal}
	repoName={currentRepoName || ''}
	userId={getCurrentUserId()}
	on:close={handleCloseProjectSettings}
	on:save={handleSaveProjectSettings}
/>

<!-- Comment Modal -->
<CommentModal
	isVisible={showCommentModal}
	selectedText={commentModalSelectedText}
	fileName={currentFilePath || ''}
	author={$authStore.user?.email || 'Anonymous'}
	on:save={handleCommentModalSave}
	on:cancel={handleCommentModalCancel}
/>

<style>
	/* Monaco Editor Diff Decorations */
	:global(.pending-edit-decoration) {
		background-color: rgba(255, 152, 0, 0.2) !important;
		border: 2px solid rgba(255, 152, 0, 0.6) !important;
		border-radius: 3px !important;
		box-shadow: 0 0 4px rgba(255, 152, 0, 0.3) !important;
	}

	/* Panel Resize Handles */
	:global(.panel-resize-handle) {
		transition: background-color 0.2s ease;
	}

	:global(.panel-resize-handle:hover) {
		background-color: #3b82f6 !important;
	}

	:global(.panel-resize-handle:active) {
		background-color: #1d4ed8 !important;
	}

	:global(.pending-edit-line-decoration) {
		background-color: rgba(255, 152, 0, 0.1) !important;
		border-left: 4px solid #ff9800 !important;
	}

	:global(.pending-edit-margin) {
		background-color: #ff9800 !important;
		width: 4px !important;
		margin-left: 2px !important;
	}

	:global(.pending-edit-glyph) {
		background-color: #ff9800 !important;
		border-radius: 50% !important;
		width: 12px !important;
		height: 12px !important;
		margin-left: 4px !important;
		margin-top: 2px !important;
	}

	:global(.pending-edit-after-content) {
		color: #4ade80 !important;
		font-style: italic !important;
		opacity: 0.8 !important;
		font-weight: bold !important;
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

	/* Comment highlighting */
	:global(.monaco-editor .comment-highlight) {
		background-color: rgba(70, 171, 104, 0.2) !important;
		border: 1px solid rgba(70, 171, 104, 0.01);
		border-radius: 2px;
	}

	:global(.monaco-editor .comment-highlight:hover) {
		background-color: rgba(70, 171, 104, 0.3) !important;
	}
</style>
