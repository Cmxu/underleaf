<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let isOpen = false;
	export let repoUrl = '';

	const dispatch = createEventDispatcher<{
		submit: { username: string; password: string };
		cancel: void;
	}>();

	let username = '';
	let password = '';
	let isLoading = false;

	// Detect the Git service type
	$: serviceType = repoUrl.includes('overleaf.com') ? 'overleaf' : 
					 repoUrl.includes('github.com') ? 'github' :
					 repoUrl.includes('gitlab.com') ? 'gitlab' : 'generic';

	function handleSubmit() {
		// For Overleaf, only username (token) is required
		// For other services, both username and password are required
		if (!username.trim()) return;
		if (serviceType !== 'overleaf' && !password.trim()) return;
		
		isLoading = true;
		dispatch('submit', { username: username.trim(), password: password || '' });
	}

	function handleCancel() {
		username = '';
		password = '';
		isLoading = false;
		dispatch('cancel');
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !isLoading) {
			handleSubmit();
		} else if (event.key === 'Escape') {
			handleCancel();
		}
	}

	// Reset form when modal opens
	$: if (isOpen) {
		username = '';
		password = '';
		isLoading = false;
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<!-- Modal backdrop -->
	<div 
		class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
		on:click={handleCancel}
		on:keydown={(e) => e.key === 'Escape' && handleCancel()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="credentials-title"
		tabindex="0"
	>
		<!-- Modal content -->
		<div 
			class="bg-white/95 backdrop-blur-glass rounded-3xl p-8 w-full max-w-md shadow-3xl border border-white/20"
			on:click|stopPropagation
			role="none"
		>
			<div class="text-center mb-6">
				<div class="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
					<svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
					</svg>
				</div>
				<h2 id="credentials-title" class="text-2xl font-bold text-gray-800 mb-2">
					{#if serviceType === 'overleaf'}
						Overleaf Git Authentication
					{:else if serviceType === 'github'}
						GitHub Authentication
					{:else if serviceType === 'gitlab'}
						GitLab Authentication
					{:else}
						Repository Authentication
					{/if}
				</h2>
				<p class="text-gray-600 text-sm leading-relaxed">
					{#if serviceType === 'overleaf'}
						Enter your Overleaf Git token. Only the token is needed for authentication.
					{:else if serviceType === 'github'}
						Enter your GitHub username and Personal Access Token.
					{:else if serviceType === 'gitlab'}
						Enter your GitLab username and Personal Access Token.
					{:else}
						This repository requires authentication. Please enter your Git credentials.
					{/if}
				</p>
			</div>

			<!-- Repository URL display -->
			<div class="mb-6 p-4 bg-gray-100/50 rounded-2xl">
				<span class="block text-sm font-medium text-gray-600 mb-1">Repository</span>
				<p class="text-gray-800 font-mono text-sm break-all">{repoUrl}</p>
			</div>

			<!-- Credentials form -->
			<form on:submit|preventDefault={handleSubmit} class="space-y-4">
				<div>
					<label for="username" class="block text-sm font-medium text-gray-700 mb-2">
						{#if serviceType === 'overleaf'}
							Git Token
						{:else}
							Username
						{/if}
					</label>
					<input
						id="username"
						type={serviceType === 'overleaf' ? 'password' : 'text'}
						bind:value={username}
						placeholder={serviceType === 'overleaf' ? 'Enter your Git token' : 'Enter your username'}
						disabled={isLoading}
						class="w-full px-4 py-3 bg-white/70 border border-gray-200 rounded-2xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
						autocomplete={serviceType === 'overleaf' ? 'email' : 'username'}
					/>
				</div>

{#if serviceType !== 'overleaf'}
				<div>
					<label for="password" class="block text-sm font-medium text-gray-700 mb-2">
						Personal Access Token
					</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						placeholder="Enter your personal access token"
						disabled={isLoading}
						class="w-full px-4 py-3 bg-white/70 border border-gray-200 rounded-2xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
						autocomplete="current-password"
					/>
				</div>
				{/if}

				<!-- Help text -->
				<div class="text-xs text-gray-500 leading-relaxed">
					{#if serviceType === 'overleaf'}
						<p class="mb-1">💡 <strong>For Overleaf:</strong> Go to Account Settings → Git Integration to find your Git token</p>
						<p class="mb-1">🔑 Only the Git token is needed - no username or password required</p>
					{:else if serviceType === 'github'}
						<p class="mb-1">💡 <strong>For GitHub:</strong> Use your username and a Personal Access Token (not password)</p>
						<p class="mb-1">🔑 Create tokens at Settings → Developer settings → Personal access tokens</p>
					{:else if serviceType === 'gitlab'}
						<p class="mb-1">💡 <strong>For GitLab:</strong> Use your username and a Personal Access Token</p>
						<p class="mb-1">🔑 Create tokens at User Settings → Access Tokens</p>
					{:else}
						<p class="mb-1">💡 Use your username and access token for authentication</p>
					{/if}
					<p>🔒 Your credentials are only used for this clone operation and are not stored</p>
				</div>

				<!-- Action buttons -->
				<div class="flex space-x-3 pt-4">
					<button
						type="button"
						on:click={handleCancel}
						disabled={isLoading}
						class="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!username.trim() || (serviceType !== 'overleaf' && !password.trim()) || isLoading}
						class="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center"
					>
						{#if isLoading}
							<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
							Cloning...
						{:else}
							<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
							Clone Repository
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	/* Custom backdrop blur effect */
	.backdrop-blur-glass {
		backdrop-filter: blur(12px);
	}

	/* Enhanced shadow */
	.shadow-3xl {
		box-shadow: 0 35px 60px -12px rgba(0, 0, 0, 0.25);
	}
</style>