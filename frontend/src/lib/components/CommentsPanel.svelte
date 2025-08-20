<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { commentsStore, commentsService, type Comment } from '$lib/stores/comments';
	import { formatDistanceToNow } from 'date-fns';
	import ConfirmDialog from './ConfirmDialog.svelte';

	export let repoName: string = '';
	export let userId: string = 'anonymous';

	const dispatch = createEventDispatcher<{
		navigateToComment: Comment;
		deleteComment: string;
		createComment: void;
	}>();

	// Subscribe to comments store
	$: comments = $commentsStore.comments;
	$: activeComment = $commentsStore.activeComment;
	$: isPolling = $commentsStore.isPolling;
	$: lastSyncTime = $commentsStore.lastSyncTime;

	// Confirm dialog state
	let showDeleteConfirm = false;
	let commentToDelete: string | null = null;
	let deleteCommentData: Comment | null = null;

	function handleCommentClick(comment: Comment) {
		dispatch('navigateToComment', comment);
	}

	function handleDeleteComment(commentId: string, comment: Comment, event: MouseEvent) {
		event.stopPropagation();
		commentToDelete = commentId;
		deleteCommentData = comment;
		showDeleteConfirm = true;
	}

	function confirmDelete() {
		if (commentToDelete) {
			dispatch('deleteComment', commentToDelete);
		}
		closeDeleteConfirm();
	}

	function closeDeleteConfirm() {
		showDeleteConfirm = false;
		commentToDelete = null;
		deleteCommentData = null;
	}

	function handleCreateComment() {
		dispatch('createComment');
	}

	async function handleRefreshComments() {
		if (!repoName) return;
		try {
			const newComments = await commentsService.refreshComments(repoName, userId);
			if (newComments.length > 0) {
				console.log(`🔄 Refreshed and found ${newComments.length} new comments`);
			}
		} catch (error) {
			console.error('Failed to refresh comments:', error);
		}
	}

	function truncateText(text: string, maxLength: number = 50): string {
		return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
	}

	function getFileNameOnly(filePath: string): string {
		return filePath.split('/').pop() || filePath;
	}

	function formatSyncTime(date: Date | null): string {
		if (!date) return 'Never synced';
		return formatDistanceToNow(date, { addSuffix: true });
	}
</script>

<div class="h-full bg-dark-800 border-l border-gray-700 flex flex-col">
	<!-- Header -->
	<div class="p-4 border-b border-gray-700">
		<div class="flex items-center justify-between mb-2">
			<h3 class="text-sm font-medium text-white">Comments</h3>
			<div class="flex items-center space-x-2">
				<button
					on:click={handleRefreshComments}
					class="btn btn-sm btn-secondary"
					title="Refresh comments from AI"
					aria-label="Refresh comments"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
				</button>
				<button
					on:click={handleCreateComment}
					class="btn btn-sm btn-primary"
					title="Create new comment"
					aria-label="Create new comment"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
				</button>
			</div>
		</div>
		
		<!-- Sync status indicator -->
		<div class="flex items-center text-xs text-gray-400">
			<div class="flex items-center space-x-1">
				{#if isPolling}
					<div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
					<span>Live sync active</span>
				{:else}
					<div class="w-2 h-2 bg-gray-500 rounded-full"></div>
					<span>Sync paused</span>
				{/if}
			</div>
			<span class="mx-2">•</span>
			<span>Last sync: {formatSyncTime(lastSyncTime)}</span>
		</div>
	</div>

	<!-- Comments List -->
	<div class="flex-1 overflow-y-auto">
		{#if comments.length === 0}
			<div class="p-4 text-center text-gray-400">
				<div class="mb-2">
					<svg class="w-8 h-8 mx-auto text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
							d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
					</svg>
				</div>
				<p class="text-sm">No comments yet</p>
				<p class="text-xs mt-1">Select text in the editor to add a comment</p>
			</div>
		{:else}
			{#each comments as comment (comment.id)}
				<div 
					class="comment-item border-b border-gray-700 p-3 cursor-pointer hover:bg-dark-700 transition-colors
					{activeComment?.id === comment.id ? 'bg-blue-900/20 border-l-4 border-l-blue-500' : ''}"
					on:click={() => handleCommentClick(comment)}
					on:keydown={(e) => e.key === 'Enter' && handleCommentClick(comment)}
					role="button"
					tabindex="0"
				>
					<!-- Comment Header -->
					<div class="flex items-start justify-between mb-2">
						<div class="flex-1 min-w-0">
							<div class="flex items-center space-x-2">
								<span class="text-xs text-blue-400 font-medium">
									{getFileNameOnly(comment.fileName)}
								</span>
								<span class="text-xs text-gray-500">
									Line {comment.startLine}
								</span>
							</div>
							<div class="flex items-center space-x-2 mt-1">
								<span class="text-xs text-gray-400">
									{comment.author}
								</span>
								<span class="text-xs text-gray-500">
									{formatDistanceToNow(comment.createdAt, { addSuffix: true })}
								</span>
							</div>
						</div>
						<button
							on:click={(e) => handleDeleteComment(comment.id, comment, e)}
							class="text-gray-500 hover:text-red-400 transition-colors p-1"
							title="Delete comment"
							aria-label="Delete comment"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
						</button>
					</div>

					<!-- Selected Text -->
					{#if comment.selectedText}
						<div class="bg-dark-600 rounded p-2 mb-2">
							<p class="text-xs text-gray-300 font-mono">
								"{truncateText(comment.selectedText, 100)}"
							</p>
						</div>
					{/if}

					<!-- Comment Content -->
					<div class="text-sm text-gray-200">
						{comment.content}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<!-- Delete Confirmation Dialog -->
<ConfirmDialog
	isVisible={showDeleteConfirm}
	title="Delete Comment"
	message={deleteCommentData ? `Are you sure you want to delete this comment from "${getFileNameOnly(deleteCommentData.fileName)}"?` : 'Are you sure you want to delete this comment?'}
	confirmText="Delete"
	cancelText="Cancel"
	isDangerous={true}
	on:confirm={confirmDelete}
	on:cancel={closeDeleteConfirm}
/>

<style>
	.comment-item {
		position: relative;
	}



	/* Ensure proper scrolling */
	.comment-item:last-child {
		border-bottom: none;
	}
</style> 