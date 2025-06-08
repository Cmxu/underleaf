<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiClient } from '$lib/utils/api';

	let repoUrl = '';
	let isLoading = false;
	let error: string | null = null;

	async function handleSubmit() {
		if (!repoUrl.trim()) return;

		isLoading = true;
		error = null;

		try {
			const result = await apiClient.cloneRepo(repoUrl);
			console.log('Repository cloned:', result);

			// Extract repository name from URL
			const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repository';

			// Store current repository in localStorage for the editor
			localStorage.setItem('currentRepo', repoName);

			// Navigate to editor with the repository
			await goto(`/editor?repo=${encodeURIComponent(repoName)}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to clone repository';
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !isLoading) {
			handleSubmit();
		}
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
						type="url"
						placeholder="Enter Git repository URL (e.g., https://github.com/user/repo)"
						disabled={isLoading}
						class="flex-1 px-8 py-6 text-lg font-medium bg-transparent text-gray-800 placeholder-gray-500 outline-none rounded-3xl disabled:opacity-70 disabled:cursor-not-allowed"
					/>
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
			</div>

			{#if error}
				<div
					class="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-red-300 text-center"
				>
					{error}
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
