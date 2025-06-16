<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { apiClient } from '$utils/api';
	import { marked } from 'marked';
	import PermissionPrompt from './PermissionPrompt.svelte';

	export let isVisible = false;
	export let height = 300; // Default height in pixels
	export let messages: Array<{ 
		role: 'user' | 'assistant'; 
		content: string; 
		timestamp: Date;
		contentBlocks?: Array<{ 
			type: 'text' | 'tool_call'; 
			content?: string; 
			toolCall?: { name: string; id: string; arguments: any; expanded?: boolean; editDiff?: any };
		}>;
	}> = [];
	export let isLoading = false;
	export let repoName = '';
	export let userId = 'anonymous';

	let messagesContainer: HTMLDivElement;
	let typingDots = '.';

	// Animate typing dots
	let typingInterval: NodeJS.Timeout | null = null;
	
	$: if (isLoading) {
		if (!typingInterval) {
			typingInterval = setInterval(() => {
				typingDots = typingDots.length >= 3 ? '.' : typingDots + '.';
			}, 500);
		}
	} else {
		if (typingInterval) {
			clearInterval(typingInterval);
			typingInterval = null;
			typingDots = '.';
		}
	}

	const dispatch = createEventDispatcher<{
		heightChange: number;
		sendMessage: string;
		clearMessages: void;
		claudeCodeRequired: { authUrl: string; sessionId: string; };
		applyEdit: { messageIndex: number; blockIndex: number; editDiff: any };
		rejectEdit: { messageIndex: number; blockIndex: number };
	}>();

	let currentMessage = '';
	let setupLoading = false;
	let authUrl = '';
	let showSetupResult = false;
	let setupResultMessage = '';
	let setupInstructions: string[] = [];

	// Permission prompt state
	let permissionPrompts: Array<{
		id: string;
		message: string;
		action: string;
		details: Record<string, any>;
		severity: 'low' | 'medium' | 'high';
		timestamp: string;
		status: string;
	}> = [];
	let permissionPromptInterval: NodeJS.Timeout | null = null;

	async function handleSendMessage() {
		if (!currentMessage.trim() || isLoading) return;

		const userMessage = currentMessage.trim();
		currentMessage = '';
		
		// Check if this is a command execution request
		if (userMessage.startsWith('/cmd ')) {
			const command = userMessage.slice(5); // Remove '/cmd ' prefix
			await executeCommand(command);
		} else {
			// Dispatch the message to parent component for AI processing
			dispatch('sendMessage', userMessage);
		}
	}

	async function executeCommand(command: string) {
		if (!command.trim() || !repoName) return;

		// Add user message to chat
		messages = [
			...messages,
			{
				role: 'user',
				content: `/cmd ${command}`,
				timestamp: new Date()
			}
		];

		// Set loading state
		isLoading = true;

		try {
			const result = await apiClient.executeCommand(repoName, command, userId);
			
			// Format the command output
			let outputContent = `**Command:** \`${result.command}\`\n**Duration:** ${result.duration}ms\n\n`;
			
			if (result.success) {
				if (result.stdout) {
					outputContent += `**Output:**\n\`\`\`\n${result.stdout}\n\`\`\`\n`;
				}
				if (result.stderr) {
					outputContent += `**Warnings/Errors:**\n\`\`\`\n${result.stderr}\n\`\`\`\n`;
				}
				if (!result.stdout && !result.stderr) {
					outputContent += `**Result:** Command completed successfully with no output.\n`;
				}
			} else {
				outputContent += `**Error:** ${result.stderr || result.error || 'Command failed'}\n\`\`\`\n${result.stderr}\n\`\`\`\n`;
			}

			// Add command result to chat
			messages = [
				...messages,
				{
					role: 'assistant',
					content: outputContent,
					timestamp: new Date(),
					contentBlocks: [{
						type: 'text',
						content: outputContent
					}]
				}
			];
		} catch (error) {
			console.error('Command execution error:', error);
			
			// Add error message to chat
			messages = [
				...messages,
				{
					role: 'assistant',
					content: `**Command Failed:** \`${command}\`\n\n**Error:** ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
					timestamp: new Date(),
					contentBlocks: [{
						type: 'text',
						content: `**Command Failed:** \`${command}\`\n\n**Error:** ${error instanceof Error ? error.message : 'Unknown error occurred'}`
					}]
				}
			];
		} finally {
			isLoading = false;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSendMessage();
		}
	}

	function formatTime(date: Date): string {
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	// Configure marked for safe HTML rendering
	marked.setOptions({
		breaks: true, // Convert line breaks to <br>
		gfm: true, // GitHub Flavored Markdown
	});

	function renderMarkdown(content: string): string {
		try {
			const result = marked(content);
			// Handle both sync and async returns from marked
			if (typeof result === 'string') {
				return result;
			} else {
				// If it's a Promise, return the original content as fallback
				console.warn('Markdown rendering returned a Promise, using plain text');
				return content;
			}
		} catch (error) {
			console.error('Markdown rendering error:', error);
			return content; // Fallback to plain text
		}
	}

	function clearChat() {
		dispatch('clearMessages');
	}

	function toggleToolCall(messageIndex: number, blockIndex: number) {
		messages = messages.map((msg, msgIdx) => {
			if (msgIdx === messageIndex && msg.contentBlocks) {
				return {
					...msg,
					contentBlocks: msg.contentBlocks.map((block, blkIdx) => {
						if (blkIdx === blockIndex && block.type === 'tool_call' && block.toolCall) {
							return {
								...block,
								toolCall: {
									...block.toolCall,
									expanded: !block.toolCall.expanded
								}
							};
						}
						return block;
					})
				};
			}
			return msg;
		});
	}

	function handleApplyEdit(messageIndex: number, blockIndex: number, editDiff: any) {
		dispatch('applyEdit', { messageIndex, blockIndex, editDiff });
		
		// Note: The main editor component will update the message state with full tracking info
		// including originalContent for revert functionality, so we don't update here
	}

	function handleRejectEdit(messageIndex: number, blockIndex: number) {
		dispatch('rejectEdit', { messageIndex, blockIndex });
		
		// Note: The main editor component will handle the state update and potential revert
	}

	// Handle height changes
	function onHeightChange(newHeight: number) {
		height = Math.max(200, Math.min(600, newHeight));
		dispatch('heightChange', height);
	}

	async function startClaudeSetup() {
		if (!repoName) {
			setupResultMessage = 'No repository loaded. Please open a repository first.';
			showSetupResult = true;
			return;
		}

		setupLoading = true;
		showSetupResult = false;
		authUrl = '';

		try {
			const result = await apiClient.startClaudeInteractiveSetup(repoName, userId);
			
			setupResultMessage = result.message;
			showSetupResult = true;
			
			if (result.needsUserCode && result.authUrl && result.sessionId) {
				// Hide the setup result and trigger the modal via event
				showSetupResult = false;
				dispatch('claudeCodeRequired', { 
					authUrl: result.authUrl, 
					sessionId: result.sessionId 
				});
				return;
			}
			
			if (result.authUrl) {
				authUrl = result.authUrl;
				setupInstructions = result.instructions || [];
			}
			
			if (result.warning) {
				setupResultMessage += '\n\n⚠️ ' + result.warning;
			}
		} catch (error) {
			setupResultMessage = `Setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
			showSetupResult = true;
		} finally {
			setupLoading = false;
		}
	}

	function openAuthUrl() {
		if (authUrl) {
			window.open(authUrl, '_blank');
		}
	}

	// Permission prompt functions
	async function checkPermissionPrompts() {
		if (!repoName || !isVisible) return;
		
		try {
			const result = await apiClient.getPermissionPrompts(repoName, userId);
			permissionPrompts = result.prompts;
		} catch (error) {
			console.warn('Failed to check permission prompts:', error);
		}
	}

	async function handlePermissionApprove(event: CustomEvent<{ promptId: string; reason?: string }>) {
		const { promptId, reason } = event.detail;
		
		try {
			await apiClient.respondToPermissionPrompt(repoName, promptId, true, reason, userId);
			// Remove from local state
			permissionPrompts = permissionPrompts.filter(p => p.id !== promptId);
		} catch (error) {
			console.error('Failed to approve permission:', error);
		}
	}

	async function handlePermissionDeny(event: CustomEvent<{ promptId: string; reason?: string }>) {
		const { promptId, reason } = event.detail;
		
		try {
			await apiClient.respondToPermissionPrompt(repoName, promptId, false, reason, userId);
			// Remove from local state
			permissionPrompts = permissionPrompts.filter(p => p.id !== promptId);
		} catch (error) {
			console.error('Failed to deny permission:', error);
		}
	}

	// Start/stop permission prompt polling based on visibility
	$: if (isVisible && repoName) {
		if (!permissionPromptInterval) {
			checkPermissionPrompts();
			permissionPromptInterval = setInterval(checkPermissionPrompts, 3000); // Check every 3 seconds
		}
	} else {
		if (permissionPromptInterval) {
			clearInterval(permissionPromptInterval);
			permissionPromptInterval = null;
		}
	}

	// Smart auto-scroll logic
	let lastMessageCount = 0;
	let shouldAutoScroll = true;

	// Check if user is near bottom of chat
	function checkScrollPosition() {
		if (!messagesContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
		const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50; // 50px threshold
		shouldAutoScroll = isNearBottom;
	}

	// Auto-scroll only when new messages are added and user is near bottom
	$: if (messages.length > lastMessageCount && messagesContainer && shouldAutoScroll) {
		setTimeout(() => {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}, 10);
		lastMessageCount = messages.length;
	} else if (messages.length !== lastMessageCount) {
		lastMessageCount = messages.length;
	}

	// Cleanup on component destroy
	import { onDestroy, onMount } from 'svelte';
	
	// Initialize permission prompt checking on mount
	onMount(() => {
		if (isVisible && repoName) {
			checkPermissionPrompts();
		}
	});
	onDestroy(() => {
		if (typingInterval) {
			clearInterval(typingInterval);
		}
		if (permissionPromptInterval) {
			clearInterval(permissionPromptInterval);
		}
	});
</script>

{#if isVisible}
	<div 
		class="bg-dark-800 border-t border-gray-700 flex flex-col h-full"
		style="height: {height}px; min-height: 0;"
	>
		<!-- Chat Header -->
		<div class="bg-dark-700 px-4 py-3 border-b border-gray-600 flex items-center justify-between">
			<div class="flex items-center space-x-2">
				<svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
				</svg>
				<h3 class="text-sm font-medium text-white">AI Assistant</h3>
				<span class="text-xs text-gray-400">({messages.length} messages)</span>
			</div>
			
			<div class="flex items-center space-x-2">
				<button
					on:click={startClaudeSetup}
					disabled={setupLoading}
					class="text-gray-400 hover:text-white transition-colors text-xs px-2 py-1 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
					title="Setup Claude AI Authentication"
					aria-label="Setup Claude AI Authentication"
				>
					{#if setupLoading}
						<div class="w-4 h-4 border-2 border-gray-400 border-t-white rounded-full animate-spin"></div>
					{:else}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					{/if}
				</button>
				<button
					on:click={clearChat}
					disabled={messages.length === 0}
					class="text-gray-400 hover:text-white transition-colors text-xs px-2 py-1 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
					title="Clear chat history"
					aria-label="Clear chat history"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Messages Area -->
		<div bind:this={messagesContainer} on:scroll={checkScrollPosition} class="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 ai-chat-messages">
			<!-- Permission Prompts -->
			{#if permissionPrompts.length > 0}
				<div class="permission-prompts-section mb-4">
					<h4 class="text-sm font-medium text-yellow-400 mb-3 flex items-center space-x-2">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
						</svg>
						<span>Permission Required</span>
						<span class="text-xs bg-yellow-600 text-white px-2 py-0.5 rounded-full">{permissionPrompts.length}</span>
					</h4>
					{#each permissionPrompts as prompt}
						<PermissionPrompt 
							{prompt} 
							on:approve={handlePermissionApprove}
							on:deny={handlePermissionDeny}
						/>
					{/each}
				</div>
			{/if}
			{#if showSetupResult}
				<div class="bg-blue-900/50 border border-blue-600 rounded-lg p-4 mb-4">
					<div class="flex items-start space-x-3">
						<svg class="w-5 h-5 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<div class="flex-1">
							<h4 class="text-sm font-medium text-blue-300 mb-2">Claude AI Setup</h4>
							<p class="text-sm text-gray-300 whitespace-pre-wrap">{setupResultMessage}</p>
							
							{#if authUrl}
								<div class="mt-4">
									<h5 class="text-xs font-medium text-blue-300 mb-2">Authentication Instructions:</h5>
									<ul class="text-xs text-gray-400 space-y-1 mb-3">
										{#each setupInstructions as instruction}
											<li>• {instruction}</li>
										{/each}
									</ul>
									<button
										on:click={openAuthUrl}
										class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm transition-colors"
									>
										Open Authentication URL
									</button>
								</div>
							{/if}
							
							<button
								on:click={() => showSetupResult = false}
								class="mt-3 text-xs text-gray-400 hover:text-gray-300 underline"
							>
								Dismiss
							</button>
						</div>
					</div>
				</div>
			{/if}

			{#if messages.length === 0}
				<div class="text-center text-gray-400 py-8">
					<svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
					</svg>
					<p class="text-sm">Start a conversation with the AI assistant</p>
					<p class="text-xs text-gray-500 mt-1">Ask questions about LaTeX, get help with your document, or request code assistance</p>
				</div>
			{:else}
				{#each messages as message, index}
					<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
						<div class="max-w-[80%] {message.role === 'user' ? 'bg-blue-600' : 'bg-dark-600'} rounded-lg px-3 py-2 overflow-hidden word-wrap break-words">
							<div class="flex items-center space-x-2 mb-1">
								<span class="text-xs font-medium {message.role === 'user' ? 'text-blue-100' : 'text-gray-300'}">
									{message.role === 'user' ? 'You' : 'AI'}
								</span>
								<span class="text-xs text-gray-400">
									{formatTime(message.timestamp)}
								</span>
							</div>
							{#if message.role === 'user'}
								<p class="text-sm text-white whitespace-pre-wrap break-words overflow-hidden">
									{message.content}
								</p>
							{:else}
								<!-- Render content blocks in order if available -->
								{#if message.contentBlocks && message.contentBlocks.length > 0}
									{#each message.contentBlocks as block, blockIndex}
										{#if block.type === 'tool_call' && block.toolCall}
											<div class="mb-2 border border-gray-500 rounded-md overflow-hidden">
												<button
													on:click={() => toggleToolCall(index, blockIndex)}
													class="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 transition-colors flex items-center justify-between text-left"
												>
													<div class="flex items-center space-x-2">
														<span class="text-orange-400">🔧</span>
														<span class="text-sm font-medium text-gray-200">Tool Call: {block.toolCall.name}</span>
														{#if block.toolCall.editDiff}
															<span class="text-xs px-2 py-1 bg-blue-600 text-blue-100 rounded">Edit</span>
														{/if}
													</div>
													<svg 
														class="w-4 h-4 text-gray-400 transition-transform {block.toolCall.expanded ? 'rotate-180' : ''}" 
														fill="none" 
														stroke="currentColor" 
														viewBox="0 0 24 24"
													>
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
													</svg>
												</button>
												{#if block.toolCall.expanded}
													<div class="px-3 py-2 bg-gray-800 border-t border-gray-600">
														{#if block.toolCall.editDiff}
															<!-- Diff viewer for Edit tool calls -->
															<div class="mb-3">
																<div class="flex items-center justify-between mb-2">
																	<div class="text-xs text-gray-400">File: {block.toolCall.editDiff.filePath}</div>
																	<div class="flex space-x-2">
																		{#if block.toolCall.editDiff.inEditor}
																			<span class="px-2 py-1 bg-blue-600 text-white text-xs rounded">In Editor</span>
																		{:else if block.toolCall.editDiff.applied && !block.toolCall.editDiff.rejected}
																			<!-- Applied but not rejected - show revert option -->
																			<span class="px-2 py-1 bg-green-600 text-white text-xs rounded mr-2">Applied</span>
																			<button
																				on:click={() => handleRejectEdit(index, blockIndex)}
																				class="px-2 py-1 bg-orange-600 hover:bg-orange-700 text-white text-xs rounded transition-colors"
																				title="Revert this change"
																			>
																				Revert
																			</button>
																		{:else if block.toolCall.editDiff.rejected}
																			<!-- Rejected (and reverted if was applied) -->
																			<span class="px-2 py-1 bg-red-600 text-white text-xs rounded">
																				{block.toolCall.editDiff.applied ? 'Reverted' : 'Rejected'}
																			</span>
																		{:else}
																			<!-- Not applied yet - show apply/reject options -->
																			<button
																				on:click={() => handleApplyEdit(index, blockIndex, block.toolCall?.editDiff)}
																				class="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors mr-2"
																			>
																				Apply
																			</button>
																			<button
																				on:click={() => handleRejectEdit(index, blockIndex)}
																				class="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
																			>
																				Reject
																			</button>
																		{/if}
																	</div>
																</div>
																
																{#if !block.toolCall.editDiff.inEditor && block.toolCall.editDiff.diff}
																	<!-- Show diff only for files not currently open in editor -->
																	<div class="bg-gray-900 rounded border font-mono text-xs">
																		{#each block.toolCall.editDiff.diff as diffLine, diffIndex}
																			<div class="flex">
																				<div class="w-8 text-right pr-2 text-gray-500 border-r border-gray-600 bg-gray-800">
																					{diffLine.lineNumber}
																				</div>
																				<div class="flex-1 pl-2 py-0.5 {diffLine.type === 'addition' ? 'bg-green-900 text-green-100' : diffLine.type === 'deletion' ? 'bg-red-900 text-red-100' : 'text-gray-300'}">
																					<span class="mr-1">
																						{#if diffLine.type === 'addition'}+{:else if diffLine.type === 'deletion'}-{:else}&nbsp;{/if}
																					</span>
																					{diffLine.line}
																				</div>
																			</div>
																		{/each}
																	</div>
																{:else if block.toolCall.editDiff.inEditor}
																	<div class="text-xs text-blue-300 bg-blue-900/20 rounded p-2">
																		💡 This change is displayed directly in the editor with apply/reject buttons. Check the currently open file.
																	</div>
																{/if}
															</div>
														{/if}
														
														<!-- Regular arguments display -->
														<div class="text-xs text-gray-400 mb-1">Arguments:</div>
														<pre class="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(block.toolCall.arguments, null, 2)}</pre>
													</div>
												{/if}
											</div>
										{:else if block.type === 'text' && block.content}
											<div class="text-sm text-gray-200 break-words overflow-hidden markdown-content">
												{@html renderMarkdown(block.content)}
											</div>
										{/if}
									{/each}
									{#if isLoading && index === messages.length - 1}
										<br/><span class="text-gray-400">{typingDots}</span>
									{/if}
								{:else}
									<!-- Fallback to regular message content for backward compatibility -->
									<div class="text-sm text-gray-200 break-words overflow-hidden markdown-content">
										{@html renderMarkdown(message.content)}
										{#if isLoading && index === messages.length - 1}
											<br/><span class="text-gray-400">{typingDots}</span>
										{/if}
									</div>
								{/if}
							{/if}
						</div>
					</div>
				{/each}
			{/if}

			{#if isLoading && (messages.length === 0 || messages[messages.length - 1].role === 'user')}
				<!-- Show typing indicator only when no assistant message exists yet -->
				<div class="flex justify-start">
					<div class="bg-dark-600 rounded-lg px-3 py-2">
						<div class="flex items-center space-x-2">
							<span class="text-sm text-gray-300">{typingDots}</span>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Input Area -->
		<div class="border-t border-gray-600 p-4">
			<div class="flex space-x-2">
				<textarea
					bind:value={currentMessage}
					on:keydown={handleKeyDown}
					placeholder="Ask the AI assistant anything... (use '/cmd <command>' to run shell commands)"
					class="flex-1 bg-dark-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none text-sm"
					rows="2"
					disabled={isLoading}
				></textarea>
				<button
					on:click={handleSendMessage}
					disabled={!currentMessage.trim() || isLoading}
					class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded transition-colors self-end"
					title="Send message (Enter)"
					aria-label="Send message"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
					</svg>
				</button>
			</div>
			<div class="flex justify-between items-center mt-2">
				<p class="text-xs text-gray-500">Press Enter to send, Shift+Enter for new line</p>
				<p class="text-xs text-gray-500">💡 Type <code class="bg-gray-700 px-1 rounded">/cmd ls</code> to run commands directly</p>
			</div>
		</div>
	</div>
{/if}

<style>


	/* Ensure proper scrolling behavior */
	:global(.ai-chat-messages) {
		scrollbar-width: thin;
		scrollbar-color: #4B5563 #1F2937;
	}

	:global(.ai-chat-messages::-webkit-scrollbar) {
		width: 6px;
	}

	:global(.ai-chat-messages::-webkit-scrollbar-track) {
		background: #1F2937;
	}

	:global(.ai-chat-messages::-webkit-scrollbar-thumb) {
		background: #4B5563;
		border-radius: 3px;
	}

	:global(.ai-chat-messages::-webkit-scrollbar-thumb:hover) {
		background: #6B7280;
	}

	/* Markdown content styling for dark theme */
	:global(.markdown-content h1) {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0.5rem 0;
		color: #F3F4F6;
	}

	:global(.markdown-content h2) {
		font-size: 1.125rem;
		font-weight: 600;
		margin: 0.5rem 0;
		color: #F3F4F6;
	}

	:global(.markdown-content h3) {
		font-size: 1rem;
		font-weight: 600;
		margin: 0.5rem 0;
		color: #F3F4F6;
	}

	:global(.markdown-content strong) {
		font-weight: 600;
		color: #F9FAFB;
	}

	:global(.markdown-content em) {
		font-style: italic;
		color: #E5E7EB;
	}

	:global(.markdown-content code) {
		background-color: #374151;
		color: #F59E0B;
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
		font-size: 0.875rem;
	}

	:global(.markdown-content pre) {
		background-color: #1F2937;
		color: #E5E7EB;
		padding: 0.75rem;
		border-radius: 0.5rem;
		overflow-x: auto;
		margin: 0.5rem 0;
		border: 1px solid #374151;
	}

	:global(.markdown-content pre code) {
		background-color: transparent;
		color: inherit;
		padding: 0;
		border-radius: 0;
	}

	:global(.markdown-content ul) {
		list-style-type: disc;
		margin-left: 1.5rem;
		margin: 0.5rem 0 0.5rem 1.5rem;
	}

	:global(.markdown-content ol) {
		list-style-type: decimal;
		margin-left: 1.5rem;
		margin: 0.5rem 0 0.5rem 1.5rem;
	}

	:global(.markdown-content li) {
		margin: 0.25rem 0;
	}

	:global(.markdown-content blockquote) {
		border-left: 4px solid #4B5563;
		padding-left: 1rem;
		margin: 0.5rem 0;
		color: #9CA3AF;
		font-style: italic;
	}

	:global(.markdown-content a) {
		color: #60A5FA;
		text-decoration: underline;
	}

	:global(.markdown-content a:hover) {
		color: #93C5FD;
	}

	:global(.markdown-content p) {
		margin: 0.5rem 0;
		line-height: 1.5;
	}

	:global(.markdown-content p:first-child) {
		margin-top: 0;
	}

	:global(.markdown-content p:last-child) {
		margin-bottom: 0;
	}
</style>