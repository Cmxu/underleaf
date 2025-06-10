<script lang="ts">
	import type { FileTreeItem } from '$types/api';

	export let item: FileTreeItem;
	export let depth: number = 0;
	export let expandedDirs: Set<string>;
	export let selectedFile: string | null;
	export let draggedItem: string | null;
	export let dragOverItem: string | null;
	export let isDragging: boolean;
	export let onToggleDirectory: (path: string) => void;
	export let onSelectFile: (path: string) => void;
	export let onContextMenu: (event: MouseEvent, path: string) => void;
	export let onDragStart: (path: string, event?: DragEvent) => void;
	export let onDragEnd: () => void;
	export let onDragOver: (path: string) => void;
	export let onDragLeave: (path: string) => void;
	export let onDrop: (path: string) => void;
	export let isValidDropTarget: (path: string) => boolean;

	function getFileIcon(item: FileTreeItem): string {
		if (item.type === 'directory') {
			return expandedDirs.has(item.path) ? '📂' : '📁';
		}

		const ext = item.name.split('.').pop()?.toLowerCase();
		switch (ext) {
			case 'tex':
				return '📄';
			case 'pdf':
				return '📋';
			case 'png':
			case 'jpg':
			case 'jpeg':
			case 'gif':
				return '🖼️';
			case 'md':
				return '📝';
			case 'json':
				return '⚙️';
			case 'bib':
				return '📚';
			default:
				return '📄';
		}
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<div class="select-none" style="margin-left: {depth * 16}px">
	{#if item.type === 'directory'}
		<button
			draggable="true"
			on:click={() => onToggleDirectory(item.path)}
			on:contextmenu={(e) => onContextMenu(e, item.path)}
			on:dragstart={(e) => onDragStart(item.path, e)}
			on:dragend={onDragEnd}
			on:dragover|preventDefault={(e) => {
				if (draggedItem && draggedItem !== item.path && isValidDropTarget(item.path)) {
					e.preventDefault();
					onDragOver(item.path);
				}
			}}
			on:dragleave={() => onDragLeave(item.path)}
			on:drop|preventDefault={() => {
				if (draggedItem && isValidDropTarget(item.path)) {
					onDrop(item.path);
				}
			}}
			class="w-full text-left px-4 py-1 hover:bg-gray-700 transition-colors flex items-center text-sm text-gray-300 cursor-pointer"
			class:opacity-50={draggedItem === item.path}
			class:bg-blue-500={dragOverItem === item.path && isDragging && isValidDropTarget(item.path)}
			class:bg-opacity-20={dragOverItem === item.path && isDragging && isValidDropTarget(item.path)}
			class:border-l-2={dragOverItem === item.path && isDragging && isValidDropTarget(item.path)}
			class:border-blue-500={dragOverItem === item.path &&
				isDragging &&
				isValidDropTarget(item.path)}
		>
			<span class="w-4 text-xs">{getFileIcon(item)}</span>
			<span class="ml-2 truncate">{item.name}</span>
		</button>
		{#if expandedDirs.has(item.path) && item.children}
			{#each item.children as child}
				<svelte:self
					item={child}
					depth={depth + 1}
					{expandedDirs}
					{selectedFile}
					{draggedItem}
					{dragOverItem}
					{isDragging}
					{onToggleDirectory}
					{onSelectFile}
					{onContextMenu}
					{onDragStart}
					{onDragEnd}
					{onDragOver}
					{onDragLeave}
					{onDrop}
					{isValidDropTarget}
				/>
			{/each}
		{/if}
	{:else}
		<button
			draggable="true"
			on:click={() => onSelectFile(item.path)}
			on:contextmenu={(e) => onContextMenu(e, item.path)}
			on:dragstart={(e) => onDragStart(item.path, e)}
			on:dragend={onDragEnd}
			class="w-full text-left px-4 py-1 hover:bg-gray-700 transition-colors flex items-center justify-between text-sm group cursor-pointer"
			class:bg-blue-600={selectedFile === item.path}
			class:text-white={selectedFile === item.path}
			class:text-gray-300={selectedFile !== item.path}
			class:opacity-50={draggedItem === item.path}
		>
			<div class="flex items-center min-w-0">
				<span class="w-4 text-xs">{getFileIcon(item)}</span>
				<span class="ml-2 truncate">{item.name}</span>
			</div>
			{#if item.size !== undefined}
				<span class="text-xs text-gray-500 group-hover:text-gray-400 ml-2 flex-shrink-0">
					{formatFileSize(item.size)}
				</span>
			{/if}
		</button>
	{/if}
</div>
