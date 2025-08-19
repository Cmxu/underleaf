<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { apiClient } from '$lib/utils/api';

	const dispatch = createEventDispatcher<{
		close: void;
		save: { settings: any };
	}>();

	export let isOpen = false;
	export let repoName = '';
	export let userId = 'anonymous';

	let settings = {
		mainDocument: null as string | null,
		compileOptions: {
			engine: 'pdflatex',
			outputDirectory: 'build'
		},
		version: '1.0'
	};

	let isLoading = false;
	let isSaving = false;
	let isDetecting = false;
	let availableTexFiles: string[] = [];
	let customMainDocument = '';
	let useCustomMain = false;

	// Load settings when modal opens
	$: if (isOpen && repoName) {
		loadSettings();
		loadTexFiles();
	}

	async function loadSettings() {
		if (!repoName) return;
		
		isLoading = true;
		try {
			const result = await apiClient.getProjectSettings(repoName, userId);
			settings = result;
			
			// Set up custom document input
			if (settings.mainDocument && !isCommonMainDocument(settings.mainDocument)) {
				useCustomMain = true;
				customMainDocument = settings.mainDocument;
			}
		} catch (error) {
			console.error('Failed to load project settings:', error);
		} finally {
			isLoading = false;
		}
	}

	async function loadTexFiles() {
		if (!repoName) return;
		
		try {
			// Get list of .tex files via command execution
			const result = await apiClient.executeCommand(repoName, 'find . -name "*.tex" -type f | sort', userId);
			if (result.success && result.stdout) {
				availableTexFiles = result.stdout.split('\n')
					.map(file => file.trim().replace('./', ''))
					.filter(file => file.length > 0);
			}
		} catch (error) {
			console.error('Failed to load .tex files:', error);
		}
	}

	function isCommonMainDocument(filename: string): boolean {
		const commonMains = ['main.tex', 'paper.tex', 'document.tex', 'thesis.tex', 'report.tex', 'article.tex', 'book.tex', 'index.tex'];
		return commonMains.includes(filename);
	}

	async function detectMainDocument() {
		if (!repoName) return;
		
		isDetecting = true;
		try {
			const result = await apiClient.detectMainDocument(repoName, userId);
			if (result.mainDocument) {
				settings.mainDocument = result.mainDocument;
				
				// Update custom input if needed
				if (!isCommonMainDocument(result.mainDocument)) {
					useCustomMain = true;
					customMainDocument = result.mainDocument;
				} else {
					useCustomMain = false;
					customMainDocument = '';
				}
			}
		} catch (error) {
			console.error('Failed to detect main document:', error);
		} finally {
			isDetecting = false;
		}
	}

	async function saveSettings() {
		if (!repoName) return;
		
		isSaving = true;
		try {
			// Use custom main document if specified
			if (useCustomMain && customMainDocument.trim()) {
				settings.mainDocument = customMainDocument.trim();
			}
			
			await apiClient.saveProjectSettings(repoName, settings, userId);
			dispatch('save', { settings });
			dispatch('close');
		} catch (error) {
			console.error('Failed to save project settings:', error);
		} finally {
			isSaving = false;
		}
	}

	function handleMainDocumentChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const value = target.value;
		
		if (value === 'custom') {
			useCustomMain = true;
			settings.mainDocument = customMainDocument.trim() || null;
		} else {
			useCustomMain = false;
			customMainDocument = '';
			settings.mainDocument = value || null;
		}
	}

	function handleCustomMainChange(event: Event) {
		const target = event.target as HTMLInputElement;
		customMainDocument = target.value;
		if (useCustomMain) {
			settings.mainDocument = customMainDocument.trim() || null;
		}
	}

	function handleClose() {
		dispatch('close');
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleClose();
		}
	}
</script>

{#if isOpen}
	<!-- Modal backdrop -->
	<div 
		class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
		on:click={handleBackdropClick}
		on:keydown={(e) => e.key === 'Escape' && handleClose()}
		role="dialog"
		aria-labelledby="settings-title"
		aria-modal="true"
	>
		<!-- Modal content -->
		<div class="bg-dark-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
			<!-- Header -->
			<div class="flex items-center justify-between p-6 border-b border-gray-700">
				<h2 id="settings-title" class="text-xl font-semibold text-white">Project Settings</h2>
				<button
					on:click={handleClose}
					class="text-gray-400 hover:text-white transition-colors"
					aria-label="Close settings"
				>
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="p-6 space-y-6">
				{#if isLoading}
					<div class="flex items-center justify-center py-8">
						<div class="loading-spinner w-8 h-8"></div>
						<span class="ml-3 text-gray-300">Loading settings...</span>
					</div>
				{:else}
					<!-- Main Document Section -->
					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<h3 class="text-lg font-medium text-white">Main Document</h3>
							<button
								on:click={detectMainDocument}
								disabled={isDetecting}
								class="text-blue-400 hover:text-blue-300 text-sm underline disabled:opacity-50"
							>
								{#if isDetecting}
									<div class="flex items-center space-x-2">
										<div class="loading-spinner w-4 h-4"></div>
										<span>Detecting...</span>
									</div>
								{:else}
									Auto-detect
								{/if}
							</button>
						</div>
						
						<p class="text-sm text-gray-400">
							The main document is the primary .tex file that will be compiled when you click "Compile Main".
						</p>

						<div class="space-y-3">
							<label for="main-document" class="block text-sm font-medium text-gray-300">
								Select main document:
							</label>
							
							<select
								id="main-document"
								on:change={handleMainDocumentChange}
								value={useCustomMain ? 'custom' : (settings.mainDocument || '')}
								class="w-full px-3 py-2 bg-dark-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
							>
								<option value="">No main document selected</option>
								{#each availableTexFiles as texFile}
									<option value={texFile}>{texFile}</option>
								{/each}
								<option value="custom">Custom file path...</option>
							</select>

							{#if useCustomMain}
								<div class="mt-2">
									<label for="custom-main" class="block text-sm font-medium text-gray-300 mb-1">
										Custom main document path:
									</label>
									<input
										id="custom-main"
										type="text"
										bind:value={customMainDocument}
										on:input={handleCustomMainChange}
										placeholder="e.g., src/main.tex"
										class="w-full px-3 py-2 bg-dark-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
									/>
								</div>
							{/if}
						</div>

						{#if settings.mainDocument}
							<div class="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
								<div class="flex items-center space-x-2">
									<svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
									</svg>
									<span class="text-green-300 text-sm">
										Main document: <span class="font-mono">{settings.mainDocument}</span>
									</span>
								</div>
							</div>
						{/if}
					</div>

					<!-- Compile Options Section -->
					<div class="space-y-4">
						<h3 class="text-lg font-medium text-white">Compile Options</h3>
						
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label for="latex-engine" class="block text-sm font-medium text-gray-300 mb-1">
									LaTeX Engine:
								</label>
								<select
									id="latex-engine"
									bind:value={settings.compileOptions.engine}
									class="w-full px-3 py-2 bg-dark-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
								>
									<option value="pdflatex">pdfLaTeX</option>
									<option value="xelatex">XeLaTeX</option>
									<option value="lualatex">LuaLaTeX</option>
									<option value="latex">LaTeX</option>
								</select>
							</div>

							<div>
								<label for="output-dir" class="block text-sm font-medium text-gray-300 mb-1">
									Output Directory:
								</label>
								<input
									id="output-dir"
									type="text"
									bind:value={settings.compileOptions.outputDirectory}
									placeholder="build"
									class="w-full px-3 py-2 bg-dark-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
								/>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-end space-x-3 p-6 border-t border-gray-700">
				<button
					on:click={handleClose}
					class="px-4 py-2 text-gray-400 hover:text-white transition-colors"
				>
					Cancel
				</button>
				<button
					on:click={saveSettings}
					disabled={isSaving || isLoading}
					class="btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if isSaving}
						<div class="flex items-center space-x-2">
							<div class="loading-spinner w-4 h-4"></div>
							<span>Saving...</span>
						</div>
					{:else}
						Save Settings
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
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