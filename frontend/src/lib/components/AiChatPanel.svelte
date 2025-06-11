<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let isVisible = false;
	export let height = 300; // Default height in pixels
	export let messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }> = [];
	export let isLoading = false;

	const dispatch = createEventDispatcher<{
		heightChange: number;
		sendMessage: string;
		clearMessages: void;
	}>();

	let currentMessage = '';

	function handleSendMessage() {
		if (!currentMessage.trim() || isLoading) return;

		const userMessage = currentMessage.trim();
		currentMessage = '';
		
		// Dispatch the message to parent component
		dispatch('sendMessage', userMessage);
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

	function clearChat() {
		dispatch('clearMessages');
	}

	// Handle height changes
	function onHeightChange(newHeight: number) {
		height = Math.max(200, Math.min(600, newHeight));
		dispatch('heightChange', height);
	}
</script>

{#if isVisible}
	<div 
		class="bg-dark-800 border-t border-gray-700 flex flex-col"
		style="height: {height}px;"
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
		<div class="flex-1 overflow-y-auto p-4 space-y-3">
			{#if messages.length === 0}
				<div class="text-center text-gray-400 py-8">
					<svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
					</svg>
					<p class="text-sm">Start a conversation with the AI assistant</p>
					<p class="text-xs text-gray-500 mt-1">Ask questions about LaTeX, get help with your document, or request code assistance</p>
				</div>
			{:else}
				{#each messages as message}
					<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
						<div class="max-w-[80%] {message.role === 'user' ? 'bg-blue-600' : 'bg-dark-600'} rounded-lg px-3 py-2">
							<div class="flex items-center space-x-2 mb-1">
								<span class="text-xs font-medium {message.role === 'user' ? 'text-blue-100' : 'text-gray-300'}">
									{message.role === 'user' ? 'You' : 'AI'}
								</span>
								<span class="text-xs text-gray-400">
									{formatTime(message.timestamp)}
								</span>
							</div>
							<p class="text-sm {message.role === 'user' ? 'text-white' : 'text-gray-200'} whitespace-pre-wrap">
								{message.content}
							</p>
						</div>
					</div>
				{/each}
			{/if}

			{#if isLoading}
				<div class="flex justify-start">
					<div class="bg-dark-600 rounded-lg px-3 py-2">
						<div class="flex items-center space-x-2">
							<div class="loading-spinner w-4 h-4"></div>
							<span class="text-xs text-gray-300">AI is typing...</span>
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
					placeholder="Ask the AI assistant anything..."
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
			<p class="text-xs text-gray-500 mt-2">Press Enter to send, Shift+Enter for new line</p>
		</div>
	</div>
{/if}