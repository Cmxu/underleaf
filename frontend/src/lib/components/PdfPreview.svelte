<script lang="ts">
	export let pdfUrl: string | null = null;
	export let isLoading = false;
	export let error: string | null = null;

	let iframeElement: HTMLIFrameElement;
	let loadError = false;

	function handleIframeLoad() {
		loadError = false;
	}

	function handleIframeError() {
		loadError = true;
	}

	function refreshPdf() {
		if (iframeElement && pdfUrl) {
			// Use PDF.js viewer with configuration for right-side thumbnails
			const timestamp = Date.now();
			const pdfJsUrl = `/pdfjs/web/viewer.html?file=${encodeURIComponent(pdfUrl)}&t=${timestamp}`;
			iframeElement.src = pdfJsUrl;
		}
	}

	function getPdfUrlWithPdfJs(baseUrl: string): string {
		// Use PDF.js viewer with custom right-side thumbnail configuration
		return `/pdfjs/web/viewer.html?file=${encodeURIComponent(baseUrl)}`;
	}

	// Refresh PDF when URL changes
	$: if (pdfUrl && iframeElement) {
		refreshPdf();
	}
</script>

<div class="h-full flex flex-col bg-gray-100">
	<div class="flex-1 relative">
		{#if isLoading}
			<div class="absolute inset-0 flex items-center justify-center bg-gray-50">
				<div class="text-center">
					<div class="loading-spinner mx-auto mb-4 w-8 h-8"></div>
					<p class="text-gray-600">Compiling PDF...</p>
				</div>
			</div>
		{:else if error}
			<div class="absolute inset-0 flex items-center justify-center bg-red-50">
				<div class="text-center max-w-md mx-auto p-6">
					<svg class="w-16 h-16 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
					</svg>
					<h3 class="text-lg font-medium text-red-800 mb-2">Compilation Error</h3>
					<p class="text-red-600 text-sm mb-4">{error}</p>
					<p class="text-xs text-gray-500">
						Install LaTeX (TeX Live) or Docker for full compilation support.
					</p>
				</div>
			</div>
		{:else if !pdfUrl}
			<div class="absolute inset-0 flex items-center justify-center">
				<div class="text-center text-gray-600">
					<svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
					</svg>
					<p class="text-lg font-medium mb-2">PDF Preview</p>
					<p class="text-sm">Compile your LaTeX document to see the preview</p>
				</div>
			</div>
		{:else if loadError}
			<div class="absolute inset-0 flex items-center justify-center bg-yellow-50">
				<div class="text-center max-w-md mx-auto p-6">
					<svg class="w-16 h-16 mx-auto mb-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
					</svg>
					<h3 class="text-lg font-medium text-yellow-800 mb-2">PDF Load Error</h3>
					<p class="text-yellow-700 text-sm mb-4">Unable to display the PDF file.</p>
					<button 
						on:click={refreshPdf}
						class="text-blue-600 hover:text-blue-500 underline text-sm"
					>
						Try Again
					</button>
				</div>
			</div>
		{:else}
			<iframe
				bind:this={iframeElement}
				src={getPdfUrlWithPdfJs(pdfUrl)}
				on:load={handleIframeLoad}
				on:error={handleIframeError}
				class="w-full h-full border-0"
				title="PDF Preview"
			></iframe>
		{/if}
	</div>
	
	{#if pdfUrl && !isLoading && !error}
		<div class="bg-gray-200 px-4 py-2 border-t border-gray-300 flex items-center justify-between text-sm">
			<span class="text-gray-600">PDF Preview</span>
			<div class="flex items-center space-x-2">
				<button 
					on:click={refreshPdf}
					class="text-gray-600 hover:text-gray-800 transition-colors"
					title="Refresh PDF"
					aria-label="Refresh PDF"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
					</svg>
				</button>
				<a 
					href={getPdfUrlWithPdfJs(pdfUrl)} 
					target="_blank" 
					rel="noopener noreferrer"
					class="text-gray-600 hover:text-gray-800 transition-colors"
					title="Open in new tab"
					aria-label="Open PDF in new tab"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
					</svg>
				</a>
			</div>
		</div>
	{/if}
</div>