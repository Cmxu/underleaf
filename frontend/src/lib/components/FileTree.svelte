<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$utils/api';
	import type { FileTreeItem } from '$types/api';
	import FileTreeNode from './FileTreeNode.svelte';

	export let repoName: string | null = null;
	export let userId: string = 'anonymous';
	export let onFileSelect: (filePath: string) => void = () => {};

	let fileTree: FileTreeItem[] = [];
	let expandedDirs = new Set<string>();
	let selectedFile: string | null = null;
	let loading = false;
	let error: string | null = null;

	// File operations state
	let showCreateFileDialog = false;
	let showCreateFolderDialog = false;
	let showRenameDialog = false;
	let newFileName = '';
	let newFolderName = '';
	let renameOldPath = '';
	let renameNewName = '';
	let contextMenuPath = '';
	let contextMenuVisible = false;
	let contextMenuX = 0;
	let contextMenuY = 0;
	let operationInProgress = false;

	// Drag and drop state
	let draggedItem: string | null = null;
	let dragOverItem: string | null = null;
	let isDragging = false;

	onMount(() => {
		if (repoName) {
			loadFileTree();
		}
	});

	$: if (repoName) {
		loadFileTree();
	}

	async function loadFileTree(retryCount = 0) {
		if (!repoName) return;

		loading = true;
		error = null;

		try {
			const response = await apiClient.getFileTree(repoName, userId);
			fileTree = response.tree;
			console.log('File tree loaded successfully:', fileTree.length, 'items');
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to load file tree';
			console.error('File tree loading error:', errorMessage);
			
			// Check if this is a repository not ready error and we haven't retried too many times
			if ((errorMessage.includes('Repository is still being prepared') || 
				 errorMessage.includes('Repository not found') || 
				 errorMessage.includes('not found')) && retryCount < 3) {
				console.log(`Repository not ready, retrying in ${2 + retryCount} seconds... (attempt ${retryCount + 1}/3)`);
				error = `Repository is being prepared... (attempt ${retryCount + 1}/3)`;
				
				// Retry with exponential backoff
				setTimeout(() => {
					loadFileTree(retryCount + 1);
				}, (2 + retryCount) * 1000);
			} else if (errorMessage.includes('Repository is still being prepared') || 
					   errorMessage.includes('Repository not found') || 
					   errorMessage.includes('not found')) {
				error = 'Repository not ready. The cloning process may still be in progress. Please try refreshing the page.';
			} else {
				error = errorMessage;
			}
		} finally {
			if (retryCount === 0 || retryCount >= 3) {
				loading = false;
			}
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

	function showContextMenu(e: MouseEvent, path: string) {
		e.preventDefault();
		contextMenuPath = path;
		contextMenuX = e.clientX;
		contextMenuY = e.clientY;
		contextMenuVisible = true;
	}

	function hideContextMenu() {
		contextMenuVisible = false;
		contextMenuPath = '';
	}

	function openCreateFileDialog() {
		newFileName = '';
		showCreateFileDialog = true;
		hideContextMenu();
	}

	function openCreateFolderDialog() {
		newFolderName = '';
		showCreateFolderDialog = true;
		hideContextMenu();
	}

	function openRenameDialog(path: string) {
		renameOldPath = path;
		renameNewName = path.split('/').pop() || '';
		showRenameDialog = true;
		hideContextMenu();
	}

	async function createFile() {
		if (!repoName || !newFileName.trim()) return;

		operationInProgress = true;
		try {
			let filePath = newFileName.trim();
			if (contextMenuPath && contextMenuPath !== '') {
				// If context menu was opened on a directory, create file inside it
				filePath = `${contextMenuPath}/${filePath}`;
			}

			await apiClient.createFile(repoName, filePath, '', userId);
			await loadFileTree();
			showCreateFileDialog = false;
			newFileName = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create file';
		} finally {
			operationInProgress = false;
		}
	}

	async function createFolder() {
		if (!repoName || !newFolderName.trim()) return;

		operationInProgress = true;
		try {
			let folderPath = newFolderName.trim();
			if (contextMenuPath && contextMenuPath !== '') {
				// If context menu was opened on a directory, create folder inside it
				folderPath = `${contextMenuPath}/${folderPath}`;
			}

			await apiClient.createFolder(repoName, folderPath, userId);
			await loadFileTree();
			showCreateFolderDialog = false;
			newFolderName = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create folder';
		} finally {
			operationInProgress = false;
		}
	}

	async function renameItem() {
		if (!repoName || !renameNewName.trim() || !renameOldPath) return;

		operationInProgress = true;
		try {
			const pathParts = renameOldPath.split('/');
			pathParts[pathParts.length - 1] = renameNewName.trim();
			const newPath = pathParts.join('/');

			await apiClient.renameFile(repoName, renameOldPath, newPath, userId);
			await loadFileTree();
			showRenameDialog = false;
			renameOldPath = '';
			renameNewName = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to rename item';
		} finally {
			operationInProgress = false;
		}
	}

	async function deleteItem(path: string) {
		if (!repoName || !path) return;
		if (!confirm(`Are you sure you want to delete "${path}"?`)) return;

		operationInProgress = true;
		try {
			await apiClient.deleteFile(repoName, path, userId);
			await loadFileTree();
			hideContextMenu();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete item';
		} finally {
			operationInProgress = false;
		}
	}

	// Close context menu when clicking elsewhere
	function handleGlobalClick(e: MouseEvent) {
		if (contextMenuVisible) {
			const target = e.target as HTMLElement;
			if (!target.closest('.context-menu')) {
				hideContextMenu();
			}
		}
	}

	// Drag and drop handlers
	function handleDragStart(path: string, event?: DragEvent) {
		draggedItem = path;
		isDragging = true;
		hideContextMenu();

		// Add dragging class to body for cursor styling
		document.body.classList.add('dragging');

		// Set drag effect
		if (event?.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			const fileName = path.split('/').pop() || path;
			event.dataTransfer.setData('text/plain', fileName);
		}
	}

	function handleDragEnd() {
		draggedItem = null;
		dragOverItem = null;
		isDragging = false;

		// Remove dragging class from body
		document.body.classList.remove('dragging');
	}

	function handleDragOver(path: string) {
		if (draggedItem && draggedItem !== path) {
			dragOverItem = path;
		}
	}

	function handleDragLeave(path: string) {
		if (dragOverItem === path) {
			dragOverItem = null;
		}
	}

	async function handleDrop(targetPath: string) {
		if (!draggedItem || !repoName || draggedItem === targetPath) {
			draggedItem = null;
			dragOverItem = null;
			isDragging = false;
			return;
		}

		// Check if trying to drop into itself or a child
		if (targetPath.startsWith(draggedItem + '/')) {
			draggedItem = null;
			dragOverItem = null;
			isDragging = false;
			return;
		}

		operationInProgress = true;
		try {
			const draggedName = draggedItem.split('/').pop() || '';
			const newPath = targetPath ? `${targetPath}/${draggedName}` : draggedName;

			// Don't move if it's the same location
			if (draggedItem === newPath) {
				return;
			}

			await apiClient.renameFile(repoName, draggedItem, newPath, userId);
			await loadFileTree();

			// Update selected file path if it was the moved file
			if (selectedFile === draggedItem) {
				selectedFile = newPath;
				onFileSelect(newPath);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to move item';
		} finally {
			operationInProgress = false;
			draggedItem = null;
			dragOverItem = null;
			isDragging = false;
		}
	}

	// Helper function to find item by path
	function findItemByPath(items: FileTreeItem[], path: string): FileTreeItem | null {
		for (const item of items) {
			if (item.path === path) {
				return item;
			}
			if (item.children) {
				const found = findItemByPath(item.children, path);
				if (found) return found;
			}
		}
		return null;
	}

	// Check if target is a valid drop zone (directory)
	function isValidDropTarget(targetPath: string): boolean {
		if (!targetPath) return true; // Root is always valid
		const targetItem = findItemByPath(fileTree, targetPath);
		return targetItem?.type === 'directory';
	}
</script>

<svelte:window on:click={handleGlobalClick} />

<div class="h-full flex flex-col bg-dark-800">
	<div class="p-4 border-b border-gray-700">
		<div class="flex items-center justify-between">
			<div>
				<h3 class="text-gray-300 font-medium flex items-center">
					<span class="mr-2">📁</span>
					File Explorer
				</h3>
				{#if repoName}
					<p class="text-xs text-gray-400 mt-1 truncate">{repoName}</p>
				{/if}
			</div>
			{#if repoName}
				<div class="flex space-x-1">
					<button
						on:click={openCreateFileDialog}
						class="p-1 text-gray-400 hover:text-white hover:bg-gray-600 rounded transition-colors"
						title="New File"
						aria-label="New File"
						disabled={operationInProgress}
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 6v6m0 0v6m0-6h6m-6 0H6"
							/>
						</svg>
					</button>
					<button
						on:click={openCreateFolderDialog}
						class="p-1 text-gray-400 hover:text-white hover:bg-gray-600 rounded transition-colors"
						title="New Folder"
						aria-label="New Folder"
						disabled={operationInProgress}
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z"
							/>
						</svg>
					</button>
				</div>
			{/if}
		</div>
	</div>

	<div
		role="region"
		aria-label="File tree drop zone"
		class="flex-1 overflow-y-auto"
		on:dragover|preventDefault={(e) => {
			if (draggedItem) {
				e.preventDefault();
				handleDragOver('');
			}
		}}
		on:dragleave={(e) => {
			if (e.currentTarget === e.target) {
				handleDragLeave('');
			}
		}}
		on:drop|preventDefault={() => handleDrop('')}
		class:bg-blue-500={dragOverItem === '' && isDragging}
		class:bg-opacity-10={dragOverItem === '' && isDragging}
		class:border-2={dragOverItem === '' && isDragging}
		class:border-blue-500={dragOverItem === '' && isDragging}
		class:border-dashed={dragOverItem === '' && isDragging}
		class:rounded={dragOverItem === '' && isDragging}
		class:m-1={dragOverItem === '' && isDragging}
	>
		{#if dragOverItem === '' && isDragging}
			<div class="p-4 text-center text-blue-400 text-sm">
				<p>📁 Drop here to move to root folder</p>
			</div>
		{/if}

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
					on:click={() => loadFileTree()}
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
					{draggedItem}
					{dragOverItem}
					{isDragging}
					onToggleDirectory={toggleDirectory}
					onSelectFile={selectFile}
					onContextMenu={showContextMenu}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					{isValidDropTarget}
				/>
			{/each}
		{/if}
	</div>

	<!-- Context Menu -->
	{#if contextMenuVisible}
		<div
			class="context-menu fixed bg-dark-700 border border-gray-600 rounded shadow-lg py-1 z-50"
			style="left: {contextMenuX}px; top: {contextMenuY}px;"
		>
			<button
				on:click={() => openRenameDialog(contextMenuPath)}
				class="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-600 transition-colors"
			>
				Rename
			</button>
			<button
				on:click={() => deleteItem(contextMenuPath)}
				class="block w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-600 transition-colors"
			>
				Delete
			</button>
			<hr class="border-gray-600 my-1" />
			<button
				on:click={openCreateFileDialog}
				class="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-600 transition-colors"
			>
				New File
			</button>
			<button
				on:click={openCreateFolderDialog}
				class="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-600 transition-colors"
			>
				New Folder
			</button>
		</div>
	{/if}

	<!-- Create File Dialog -->
	{#if showCreateFileDialog}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div class="bg-dark-700 border border-gray-600 rounded-lg p-6 w-96">
				<h3 class="text-lg font-medium text-white mb-4">Create New File</h3>
				<input
					type="text"
					bind:value={newFileName}
					placeholder="Enter file name (e.g., document.tex)"
					class="w-full px-3 py-2 bg-dark-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
					on:keydown={(e) => e.key === 'Enter' && createFile()}
				/>
				<div class="flex space-x-3 mt-4">
					<button
						on:click={createFile}
						disabled={!newFileName.trim() || operationInProgress}
						class="btn-primary px-4 py-2 text-sm disabled:opacity-50"
					>
						{operationInProgress ? 'Creating...' : 'Create'}
					</button>
					<button
						on:click={() => (showCreateFileDialog = false)}
						disabled={operationInProgress}
						class="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors disabled:opacity-50"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Create Folder Dialog -->
	{#if showCreateFolderDialog}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div class="bg-dark-700 border border-gray-600 rounded-lg p-6 w-96">
				<h3 class="text-lg font-medium text-white mb-4">Create New Folder</h3>
				<input
					type="text"
					bind:value={newFolderName}
					placeholder="Enter folder name"
					class="w-full px-3 py-2 bg-dark-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
					on:keydown={(e) => e.key === 'Enter' && createFolder()}
				/>
				<div class="flex space-x-3 mt-4">
					<button
						on:click={createFolder}
						disabled={!newFolderName.trim() || operationInProgress}
						class="btn-primary px-4 py-2 text-sm disabled:opacity-50"
					>
						{operationInProgress ? 'Creating...' : 'Create'}
					</button>
					<button
						on:click={() => (showCreateFolderDialog = false)}
						disabled={operationInProgress}
						class="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors disabled:opacity-50"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Rename Dialog -->
	{#if showRenameDialog}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div class="bg-dark-700 border border-gray-600 rounded-lg p-6 w-96">
				<h3 class="text-lg font-medium text-white mb-4">Rename Item</h3>
				<input
					type="text"
					bind:value={renameNewName}
					placeholder="Enter new name"
					class="w-full px-3 py-2 bg-dark-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
					on:keydown={(e) => e.key === 'Enter' && renameItem()}
				/>
				<div class="flex space-x-3 mt-4">
					<button
						on:click={renameItem}
						disabled={!renameNewName.trim() || operationInProgress}
						class="btn-primary px-4 py-2 text-sm disabled:opacity-50"
					>
						{operationInProgress ? 'Renaming...' : 'Rename'}
					</button>
					<button
						on:click={() => (showRenameDialog = false)}
						disabled={operationInProgress}
						class="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors disabled:opacity-50"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Drag and drop styles */
	:global(.dragging) {
		cursor: grabbing !important;
	}

	:global(.drag-over) {
		background-color: rgba(59, 130, 246, 0.1);
		border-left: 2px solid rgb(59, 130, 246);
	}

	/* Custom drag ghost styles */
	:global(.drag-ghost) {
		background: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
		pointer-events: none;
	}
</style>
