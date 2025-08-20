<script lang="ts">
	import { createEventDispatcher, onMount, tick, afterUpdate } from 'svelte';
	import type { Comment } from '$lib/stores/comments';

	export let isVisible = false;
	export let editingComment: Comment | null = null;
	export let selectedText = '';
	export let fileName = '';
	export let author = '';

	const dispatch = createEventDispatcher<{
		save: { content: string; editingComment: Comment | null };
		cancel: void;
	}>();

	let content = '';
	let isSubmitting = false;
	let textareaElement: HTMLTextAreaElement;
	let shouldFocus = false;

	// Update content when editing comment changes
	$: if (editingComment) {
		content = editingComment.content;
	} else {
		content = '';
	}

	// Reset state when modal visibility changes
	$: if (!isVisible) {
		content = '';
		isSubmitting = false;
		shouldFocus = false;
	}

	// Set focus flag when modal becomes visible
	$: if (isVisible) {
		shouldFocus = true;
	}

	// Use afterUpdate to focus the textarea after DOM updates
	afterUpdate(() => {
		if (shouldFocus && textareaElement && isVisible) {
			// Add a small delay to let autofocus work first
			setTimeout(() => {
				if (document.activeElement !== textareaElement) {
					textareaElement.focus();
				}
				shouldFocus = false; // Reset flag
			}, 50);
		}
	});

	function handleSubmit() {
		if (!content.trim()) return;
		
		isSubmitting = true;
		dispatch('save', { content: content.trim(), editingComment });
		
		// Reset after a short delay to allow animation
		setTimeout(() => {
			isSubmitting = false;
			content = '';
		}, 100);
	}

	function handleCancel() {
		dispatch('cancel');
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleCancel();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleCancel();
		} else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
			handleSubmit();
		}
	}

	function getFileNameOnly(filePath: string): string {
		return filePath.split('/').pop() || filePath;
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isVisible}
	<div 
		class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
		on:click={handleBackdropClick}
		on:keydown={handleKeydown}
		role="dialog"
		aria-labelledby="comment-modal-title"
		aria-modal="true"
	>
		<div 
			class="bg-dark-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
			on:click|stopPropagation
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-6 border-b border-gray-700">
				<h2 id="comment-modal-title" class="text-xl font-semibold text-white">
					{editingComment ? 'Edit Comment' : 'Add Comment'}
				</h2>
				<button
					on:click={handleCancel}
					class="text-gray-400 hover:text-white transition-colors p-1"
					aria-label="Close modal"
				>
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="p-6 space-y-4">
				<!-- File and Location Info -->
				<div class="bg-dark-700 rounded-lg p-4 space-y-2">
					<div class="flex items-center space-x-2 text-sm">
						<svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
								d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
						</svg>
						<span class="text-blue-400 font-medium">{getFileNameOnly(fileName)}</span>
						{#if editingComment}
							<span class="text-gray-500">•</span>
							<span class="text-gray-400">Line {editingComment.startLine}</span>
						{/if}
					</div>
					
					{#if selectedText}
						<div class="mt-2">
							<div class="text-xs text-gray-400 mb-1">Selected text:</div>
							<div class="bg-dark-600 rounded p-2 text-sm text-gray-300 font-mono border-l-2 border-yellow-500">
								"{selectedText}"
							</div>
						</div>
					{/if}
				</div>

				<!-- Comment Input -->
				<div class="space-y-2">
					<label for="comment-content" class="block text-sm font-medium text-gray-300">
						Comment
					</label>
					{#key isVisible}
						<textarea
							id="comment-content"
							bind:value={content}
							placeholder="Enter your comment..."
							rows="4"
							class="w-full px-3 py-2 bg-dark-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-vertical"
							autofocus
							bind:this={textareaElement}
						></textarea>
					{/key}
					<div class="text-xs text-gray-400">
						Tip: Use Ctrl/Cmd + Enter to save quickly
					</div>
				</div>

				<!-- Author Info -->
				<div class="flex items-center space-x-2 text-sm text-gray-400">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
							d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
					</svg>
					<span>Commenting as: <span class="text-white">{author}</span></span>
				</div>
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-end space-x-3 p-6 border-t border-gray-700">
				<button
					on:click={handleCancel}
					class="px-4 py-2 text-gray-400 hover:text-white transition-colors"
					disabled={isSubmitting}
				>
					Cancel
				</button>
				<button
					on:click={handleSubmit}
					disabled={!content.trim() || isSubmitting}
					class="btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if isSubmitting}
						<div class="flex items-center space-x-2">
							<div class="loading-spinner w-4 h-4"></div>
							<span>{editingComment ? 'Updating...' : 'Adding...'}</span>
						</div>
					{:else}
						{editingComment ? 'Update Comment' : 'Add Comment'}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Modal animation */
	div[role="dialog"] {
		animation: fadeIn 0.2s ease-out;
	}

	div[role="dialog"] > div {
		animation: slideIn 0.2s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes slideIn {
		from { 
			opacity: 0;
			transform: translateY(-20px) scale(0.95);
		}
		to { 
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
</style> 