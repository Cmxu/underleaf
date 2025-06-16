<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	
	const dispatch = createEventDispatcher<{
		approve: { promptId: string; reason?: string };
		deny: { promptId: string; reason?: string };
	}>();

	export let prompt: {
		id: string;
		message: string;
		action: string;
		details: Record<string, any>;
		severity: 'low' | 'medium' | 'high';
		timestamp: string;
		status: string;
	};

	let reason = '';
	let isResponding = false;

	function getSeverityColor(severity: string) {
		switch (severity) {
			case 'high':
				return 'border-red-500 bg-red-500/10';
			case 'medium':
				return 'border-yellow-500 bg-yellow-500/10';
			case 'low':
				return 'border-green-500 bg-green-500/10';
			default:
				return 'border-gray-500 bg-gray-500/10';
		}
	}

	function getSeverityIcon(severity: string) {
		switch (severity) {
			case 'high':
				return '🚨';
			case 'medium':
				return '⚠️';
			case 'low':
				return 'ℹ️';
			default:
				return '❓';
		}
	}

	async function handleApprove() {
		if (isResponding) return;
		isResponding = true;
		
		dispatch('approve', {
			promptId: prompt.id,
			reason: reason.trim() || undefined
		});
	}

	async function handleDeny() {
		if (isResponding) return;
		isResponding = true;
		
		dispatch('deny', {
			promptId: prompt.id,
			reason: reason.trim() || undefined
		});
	}

	function formatTimestamp(timestamp: string) {
		return new Date(timestamp).toLocaleTimeString();
	}
</script>

<div class="permission-prompt border rounded-lg p-4 mb-4 {getSeverityColor(prompt.severity)}">
	<div class="flex items-start space-x-3">
		<div class="text-2xl flex-shrink-0">
			{getSeverityIcon(prompt.severity)}
		</div>
		
		<div class="flex-1">
			<div class="flex items-center justify-between mb-2">
				<h3 class="text-lg font-semibold text-white">Permission Required</h3>
				<span class="text-xs text-gray-400">
					{formatTimestamp(prompt.timestamp)}
				</span>
			</div>
			
			<div class="space-y-3">
				<div>
					<p class="text-gray-300 mb-2">{prompt.message}</p>
					
					<div class="bg-gray-800 rounded p-3 text-sm">
						<div class="flex items-center space-x-2 mb-2">
							<span class="text-gray-400">Action:</span>
							<span class="text-white font-mono">{prompt.action}</span>
						</div>
						<div class="flex items-center space-x-2 mb-2">
							<span class="text-gray-400">Severity:</span>
							<span class="text-white capitalize">{prompt.severity}</span>
						</div>
						
						{#if prompt.details && Object.keys(prompt.details).length > 0}
							<div class="mt-2 pt-2 border-t border-gray-700">
								<span class="text-gray-400 text-xs">Details:</span>
								<div class="mt-1 space-y-1">
									{#each Object.entries(prompt.details) as [key, value]}
										<div class="flex items-start space-x-2">
											<span class="text-gray-500 text-xs min-w-0 flex-shrink-0">{key}:</span>
											<span class="text-gray-300 text-xs break-all">{value}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</div>

				<div>
					<label for="reason-{prompt.id}" class="block text-sm text-gray-400 mb-2">
						Reason (optional):
					</label>
					<textarea
						id="reason-{prompt.id}"
						bind:value={reason}
						placeholder="Provide a reason for your decision..."
						class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 text-sm"
						rows="2"
						disabled={isResponding}
					></textarea>
				</div>

				<div class="flex items-center space-x-3">
					<button
						on:click={handleApprove}
						disabled={isResponding}
						class="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-4 rounded text-sm font-medium transition-colors"
					>
						{#if isResponding}
							<div class="flex items-center justify-center space-x-2">
								<div class="loading-spinner w-4 h-4"></div>
								<span>Approving...</span>
							</div>
						{:else}
							✅ Approve
						{/if}
					</button>
					
					<button
						on:click={handleDeny}
						disabled={isResponding}
						class="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-4 rounded text-sm font-medium transition-colors"
					>
						{#if isResponding}
							<div class="flex items-center justify-center space-x-2">
								<div class="loading-spinner w-4 h-4"></div>
								<span>Denying...</span>
							</div>
						{:else}
							❌ Deny
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.permission-prompt {
		animation: slideIn 0.3s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.loading-spinner {
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