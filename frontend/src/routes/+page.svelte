<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiClient } from '$lib/utils/api';
	import { recentUrls } from '$lib/stores/recentUrls';
	import { authStore, authService } from '$lib/stores/auth';
	import AuthModal from '$lib/components/AuthModal.svelte';
	import CredentialsModal from '$lib/components/CredentialsModal.svelte';

	let repoUrl = '';
	let isLoading = false;
	let error: string | null = null;
	let success: string | null = null;
	let showDropdown = false;
	let showAuthModal = false;
	let showCredentialsModal = false;

	async function handleSubmit() {
		await doSubmit();
	}

	async function doSubmit(credentials?: { username: string; password: string }) {
		if (!repoUrl.trim()) return;

		// Check if user is authenticated
		if (!$authStore.user) {
			showAuthModal = true;
			return;
		}

		isLoading = true;
		error = null;
		success = null;

		try {
			// Extract repository name from URL
			const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repository';

			// Check if repository already exists locally
			const userId = $authStore.user.id;
			console.log('Checking if repo exists for user:', userId, 'repo:', repoName);
			const repoExists = await apiClient.checkRepoExists(repoName, userId);
			console.log('checkRepoExists result:', repoExists);

			// If it's a new repository that requires authentication and we don't have credentials, prompt for them
			const requiresAuth = repoUrl.includes('overleaf.com') || 
								  repoUrl.includes('git.overleaf.com') ||
								  (repoUrl.includes('github.com') && !repoUrl.includes('/public/')) ||
								  repoUrl.includes('gitlab.com') ||
								  repoUrl.includes('bitbucket.org');
								  
			console.log('=== CREDENTIAL DETECTION DEBUG ===');
			console.log('Repository URL:', repoUrl);
			console.log('Repository exists:', repoExists);
			console.log('Requires auth:', requiresAuth);
			console.log('Has credentials:', !!credentials);
			console.log('Credentials object:', credentials);
			console.log('Should prompt?', !repoExists && requiresAuth && !credentials);
			console.log('===================================');
								  
			if (!repoExists && requiresAuth && !credentials) {
				console.log('🔐 NEW REPOSITORY REQUIRING AUTHENTICATION - SHOWING CREDENTIALS MODAL');
				success = 'This repository requires authentication. Please provide your Git credentials.';
				showCredentialsModal = true;
				isLoading = false;
				return;
			}

			if (repoExists) {
				// Repository exists, just navigate to it
				console.log('Repository already exists locally, navigating to editor');
				
				// Add to recent URLs
				recentUrls.addUrl(repoUrl);

				// Store current repository in localStorage for the editor
				localStorage.setItem('currentRepo', repoName);

				// Show message and navigate
				success = 'Opening existing repository';
				setTimeout(async () => {
					await goto(`/editor?repo=${encodeURIComponent(repoName)}`);
				}, 500);
			} else {
				// Repository doesn't exist, clone it
				const result = await apiClient.cloneRepo(repoUrl, userId, credentials);
				console.log('Repository cloned:', result);

				// Ensure the container is ready and repository is accessible
				success = 'Repository cloned, preparing environment...';
				
				try {
					// Wait for the container to be ready and verify repository access
					console.log('Ensuring container is ready for repository:', repoName);
					await apiClient.ensureUserContainer(repoName, userId);
					
					console.log('Container ready, verifying repository access...');
					// Try to get file tree to verify repository is ready
					await apiClient.getFileTree(repoName, userId);
					
					console.log('Repository is ready and accessible');
					
					// Add to recent URLs
					recentUrls.addUrl(repoUrl);

					// Store current repository in localStorage for the editor
					localStorage.setItem('currentRepo', repoName);

					// Show success message briefly before navigating
					success = 'Repository ready! Opening editor...';
					
					// Navigate to editor after a short delay to show the success message
					setTimeout(async () => {
						await goto(`/editor?repo=${encodeURIComponent(repoName)}`);
					}, 500);
				} catch (containerError) {
					console.error('Failed to prepare repository environment:', containerError);
					const errorMsg = containerError instanceof Error ? containerError.message : 'Unknown error';
					console.error('Detailed error:', errorMsg);
					error = `Repository cloned but failed to prepare environment: ${errorMsg}. Please try again.`;
				}
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to access repository';
			
			// Check if this is an authentication error
			if (errorMessage.includes('could not read Username') || 
				errorMessage.includes('Authentication failed') ||
				errorMessage.includes('fatal: could not read Password') ||
				errorMessage.includes('No such device or address') ||
				errorMessage.includes('repository not found') ||
				errorMessage.includes('Overleaf repository')) {
				// Show credentials modal for authentication
				showCredentialsModal = true;
			} else {
				error = errorMessage;
			}
		} finally {
			isLoading = false;
		}
	}

	function handleCredentialsSubmit(event: CustomEvent<{ username: string; password: string }>) {
		showCredentialsModal = false;
		doSubmit(event.detail);
	}

	function handleCredentialsCancel() {
		showCredentialsModal = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !isLoading) {
			handleSubmit();
		}
	}

	function selectRecentUrl(url: string) {
		repoUrl = url;
		showDropdown = false;
	}

	function removeRecentUrl(event: Event, url: string) {
		event.stopPropagation();
		recentUrls.removeUrl(url);
	}

	function openAuthModal() {
		showAuthModal = true;
	}

	async function handleSignOut() {
		await authService.signOut();
	}
</script>

<svelte:head>
	<title>Underleaf - Collaborative LaTeX Editor</title>
	<meta
		name="description"
		content="Modern collaborative LaTeX editor with real-time collaboration and Git integration"
	/>
</svelte:head>

<div class="min-h-screen bg-dark-800">
	<!-- Header with auth -->
	<header class="p-6">
		<div class="max-w-6xl mx-auto flex justify-between items-center">
			<div class="text-2xl font-bold text-white">Underleaf</div>
			
			<div class="flex items-center space-x-4">
				{#if $authStore.loading}
					<div class="loading-spinner"></div>
				{:else if $authStore.user}
					<div class="flex items-center space-x-3">
						<span class="text-gray-300">Welcome, {$authStore.user.email}</span>
						<button
							on:click={handleSignOut}
							class="text-gray-400 hover:text-white transition-colors"
						>
							Sign Out
						</button>
					</div>
				{:else}
					<button
						on:click={openAuthModal}
						class="btn-primary px-6 py-2 rounded-xl"
					>
						Sign In
					</button>
				{/if}
			</div>
		</div>
	</header>

	<!-- Main content -->
	<div class="flex items-center justify-center p-8 pt-0">
		<div class="w-full max-w-2xl">
		<div class="text-center mb-12">
			<h1 class="text-6xl md:text-7xl font-bold text-white mb-6 text-shadow">Underleaf</h1>
			<p class="text-xl text-gray-300 max-w-lg mx-auto leading-relaxed">
				A modern collaborative LaTeX editor with real-time collaboration, AI assistance, and Git
				integration.
			</p>
		</div>

		<form on:submit|preventDefault={handleSubmit} class="space-y-6">
			<div class="relative">
				<div
					class="relative flex items-center bg-white/95 backdrop-blur-glass rounded-3xl p-1 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:-translate-y-1 focus-within:bg-white focus-within:shadow-3xl focus-within:-translate-y-1 border border-white/10 focus-within:border-white/20"
					class:opacity-50={!$authStore.user && !$authStore.loading}
				>
					<input
						bind:value={repoUrl}
						on:keydown={handleKeydown}
						on:focus={() => (showDropdown = $recentUrls.length > 0)}
						on:blur={() => setTimeout(() => (showDropdown = false), 150)}
						type="url"
						placeholder={$authStore.user ? "Enter Git repository URL (e.g., https://github.com/user/repo)" : "Sign in to access repositories"}
						disabled={isLoading || (!$authStore.user && !$authStore.loading)}
						class="flex-1 px-8 py-6 text-lg font-medium bg-transparent text-gray-800 placeholder-gray-500 outline-none rounded-3xl disabled:opacity-70 disabled:cursor-not-allowed"
					/>
					{#if $recentUrls.length > 0}
						<button
							type="button"
							on:click={() => (showDropdown = !showDropdown)}
							class="mr-2 p-2 text-gray-600 hover:text-gray-800 transition-colors"
							title="Recent repositories"
							aria-label="Show recent repositories"
						>
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
						</button>
					{/if}
					<button
						type="submit"
						disabled={isLoading || !repoUrl.trim() || (!$authStore.user && !$authStore.loading)}
						class="btn-primary h-16 w-16 rounded-2xl flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
					>
						{#if isLoading}
							<div class="loading-spinner"></div>
						{:else}
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13 7l5 5m0 0l-5 5m5-5H6"
								/>
							</svg>
						{/if}
					</button>
				</div>

				{#if showDropdown && $recentUrls.length > 0}
					<div
						class="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-glass rounded-2xl shadow-2xl border border-white/20 overflow-hidden z-10"
					>
						<div class="p-3 text-sm font-medium text-gray-600 border-b border-gray-200/50">
							Recent repositories
						</div>
						{#each $recentUrls as url}
							<div class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100/50 transition-colors group">
								<button
									type="button"
									on:click={() => selectRecentUrl(url)}
									class="text-gray-800 font-medium truncate flex-1 mr-2 text-left"
								>
									{url}
								</button>
								<button
									type="button"
									on:click={(e) => removeRecentUrl(e, url)}
									class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
									title="Remove from recent"
									aria-label="Remove from recent repositories"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			{#if error}
				<div
					class="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-red-300 text-center"
				>
					{error}
				</div>
			{/if}

			{#if success}
				<div
					class="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-green-300 text-center"
				>
					{success}
				</div>
			{/if}

			<div class="text-center">
				{#if !$authStore.user && !$authStore.loading}
					<p class="text-gray-400 text-sm leading-relaxed mb-4">
						<strong>Sign in required:</strong> You need to authenticate to access Git repositories
					</p>
					<button
						on:click={openAuthModal}
						class="btn-primary px-8 py-3 rounded-xl font-medium"
					>
						Sign In to Continue
					</button>
				{:else}
					<p class="text-gray-400 text-sm leading-relaxed">
						Clone a LaTeX project from GitHub and start collaborating instantly
					</p>
				{/if}
			</div>
		</form>
		</div>
	</div>
</div>

<!-- Auth Modal -->
<AuthModal bind:isOpen={showAuthModal} />

<!-- Credentials Modal -->
<CredentialsModal 
	bind:isOpen={showCredentialsModal}
	{repoUrl}
	on:submit={handleCredentialsSubmit}
	on:cancel={handleCredentialsCancel}
/>
