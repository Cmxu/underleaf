<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let isVisible = false;
	export let title = 'Confirm Action';
	export let message = 'Are you sure you want to proceed?';
	export let confirmText = 'Confirm';
	export let cancelText = 'Cancel';
	export let isDangerous = false; // For styling destructive actions
	export let isLoading = false;

	const dispatch = createEventDispatcher<{
		confirm: void;
		cancel: void;
	}>();

	function handleConfirm() {
		dispatch('confirm');
	}

	function handleCancel() {
		if (isLoading) return;
		dispatch('cancel');
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget && !isLoading) {
			handleCancel();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !isLoading) {
			handleCancel();
		} else if (event.key === 'Enter') {
			handleConfirm();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isVisible}
	<div 
		class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
		on:click={handleBackdropClick}
		on:keydown={handleKeydown}
		role="dialog"
		aria-labelledby="confirm-dialog-title"
		aria-describedby="confirm-dialog-message"
		aria-modal="true"
		tabindex="0"
	>
		<div 
			class="bg-dark-800 rounded-lg shadow-xl max-w-md w-full"
			on:click|stopPropagation
		>
			<!-- Header -->
			<div class="p-6 pb-4">
				<div class="flex items-start space-x-3">
					{#if isDangerous}
						<div class="flex-shrink-0">
							<svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
							</svg>
						</div>
					{:else}
						<div class="flex-shrink-0">
							<svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
									d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
					{/if}
					<div class="flex-1">
						<h3 id="confirm-dialog-title" class="text-lg font-medium text-white">
							{title}
						</h3>
						<p id="confirm-dialog-message" class="mt-2 text-sm text-gray-300">
							{message}
						</p>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-end space-x-3 p-6 pt-4 border-t border-gray-700">
				<button
					on:click={handleCancel}
					disabled={isLoading}
					class="px-4 py-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{cancelText}
				</button>
				<button
					on:click={handleConfirm}
					disabled={isLoading}
					class="px-6 py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed
					{isDangerous 
						? 'bg-red-600 hover:bg-red-700 text-white' 
						: 'btn-primary'}"
				>
					{#if isLoading}
						<div class="flex items-center space-x-2">
							<div class="loading-spinner w-4 h-4"></div>
							<span>Processing...</span>
						</div>
					{:else}
						{confirmText}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Modal animation */
	div[role="dialog"] {
		animation: fadeIn 0.15s ease-out;
	}

	div[role="dialog"] > div {
		animation: slideIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes slideIn {
		from { 
			opacity: 0;
			transform: translateY(-10px) scale(0.98);
		}
		to { 
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
</style> 