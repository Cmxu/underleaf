<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiClient } from '$lib/utils/api';
	import { recentUrls } from '$lib/stores/recentUrls';

	let repoUrl = '';
	let isLoading = false;
	let error: string | null = null;
	let success: string | null = null;
	let showDropdown = false;

	async function handleSubmit() {
		if (!repoUrl.trim()) return;

		isLoading = true;
		error = null;
		success = null;

		try {
			// Extract repository name from URL
			const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repository';

			// Check if repository already exists locally
			const repoExists = await apiClient.checkRepoExists(repoName);

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
				const result = await apiClient.cloneRepo(repoUrl);
				console.log('Repository cloned:', result);

				// Add to recent URLs
				recentUrls.addUrl(repoUrl);

				// Store current repository in localStorage for the editor
				localStorage.setItem('currentRepo', repoName);

				// Show success message briefly before navigating
				success = result.message;
				
				// Navigate to editor after a short delay to show the success message
				setTimeout(async () => {
					await goto(`/editor?repo=${encodeURIComponent(repoName)}`);
				}, 1000);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to access repository';
		} finally {
			isLoading = false;
		}
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
</script>

<svelte:head>
	<title>Underleaf - Collaborative LaTeX Editor</title>
	<meta
		name="description"
		content="Modern collaborative LaTeX editor with real-time collaboration and Git integration"
	/>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-8 bg-dark-800">
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
				>
					<input
						bind:value={repoUrl}
						on:keydown={handleKeydown}
						on:focus={() => (showDropdown = $recentUrls.length > 0)}
						on:blur={() => setTimeout(() => (showDropdown = false), 150)}
						type="url"
						placeholder="Enter Git repository URL (e.g., https://github.com/user/repo)"
						disabled={isLoading}
						class="flex-1 px-8 py-6 text-lg font-medium bg-transparent text-gray-800 placeholder-gray-500 outline-none rounded-3xl disabled:opacity-70 disabled:cursor-not-allowed"
					/>
					{#if $recentUrls.length > 0}
						<button
							type="button"
							on:click={() => (showDropdown = !showDropdown)}
							class="mr-2 p-2 text-gray-600 hover:text-gray-800 transition-colors"
							title="Recent repositories"
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
						disabled={isLoading || !repoUrl.trim()}
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
				<p class="text-gray-400 text-sm leading-relaxed">
					Clone a LaTeX project from GitHub and start collaborating instantly
				</p>
			</div>
		</form>
	</div>
</div>
