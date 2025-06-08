<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$utils/api';
	import type { FileTreeItem } from '$types/api';
	import FileTreeNode from './FileTreeNode.svelte';

	export let repoName: string | null = null;
	export let onFileSelect: (filePath: string) => void = () => {};

	let fileTree: FileTreeItem[] = [];
	let expandedDirs = new Set<string>();
	let selectedFile: string | null = null;
	let loading = false;
	let error: string | null = null;

	onMount(() => {
		if (repoName) {
			loadFileTree();
		}
	});

	$: if (repoName) {
		loadFileTree();
	}

	async function loadFileTree() {
		if (!repoName) return;

		loading = true;
		error = null;

		try {
			const response = await apiClient.getFileTree(repoName);
			fileTree = response.tree;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load file tree';
		} finally {
			loading = false;
		}
	}

	function toggleDirectory(path: string) {
		if (expandedDirs.has(path)) {
			expandedDirs.delete(path);
		} else {
			expandedDirs.add(path);
		}
		expandedDirs = new Set(expandedDirs); // Trigger reactivity
	}

	function selectFile(filePath: string) {
		selectedFile = filePath;
		onFileSelect(filePath);
	}
</script>

<div class="h-full flex flex-col bg-dark-800">
	<div class="p-4 border-b border-gray-700">
		<h3 class="text-gray-300 font-medium flex items-center">
			<span class="mr-2">📁</span>
			File Explorer
		</h3>
		{#if repoName}
			<p class="text-xs text-gray-400 mt-1 truncate">{repoName}</p>
		{/if}
	</div>

	<div class="flex-1 overflow-y-auto">
		{#if loading}
			<div class="p-4 text-center">
				<div class="loading-spinner mx-auto mb-2"></div>
				<p class="text-gray-400 text-sm">Loading files...</p>
			</div>
		{:else if error}
			<div class="p-4 text-center">
				<p class="text-red-400 text-sm mb-2">⚠️ Error loading files</p>
				<p class="text-gray-400 text-xs">{error}</p>
				<button
					on:click={loadFileTree}
					class="mt-2 text-blue-400 hover:text-blue-300 text-sm underline"
				>
					Retry
				</button>
			</div>
		{:else if !repoName}
			<div class="p-4 text-center text-gray-400 text-sm">
				<p>📂</p>
				<p class="mt-2">No repository loaded</p>
			</div>
		{:else if fileTree.length === 0}
			<div class="p-4 text-center text-gray-400 text-sm">
				<p>📭</p>
				<p class="mt-2">Repository is empty</p>
			</div>
		{:else}
			{#each fileTree as item}
				<FileTreeNode
					{item}
					depth={0}
					{expandedDirs}
					{selectedFile}
					onToggleDirectory={toggleDirectory}
					onSelectFile={selectFile}
				/>
			{/each}
		{/if}
	</div>
</div>
