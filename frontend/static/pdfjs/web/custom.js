// Custom JavaScript to keep sidebar closed by default
document.addEventListener('DOMContentLoaded', function () {
	// Wait for PDF.js to initialize
	const initializeSidebar = () => {
		// Keep sidebar closed by default - remove the sidebarOpen class
		const outerContainer = document.getElementById('outerContainer');
		if (outerContainer) {
			// Remove sidebarOpen class to keep sidebar closed
			outerContainer.classList.remove('sidebarOpen');
			
			// Reset to automatic zoom after sidebar is closed
			setTimeout(() => {
				resetToAutomaticZoom();
			}, 100);
		}
	};

	// Try to initialize immediately
	initializeSidebar();

	// Also try after a short delay in case PDF.js hasn't fully loaded
	setTimeout(initializeSidebar, 100);
	setTimeout(initializeSidebar, 500);
	setTimeout(initializeSidebar, 1000);
});

// Also handle when the document finishes loading
window.addEventListener('load', function () {
	setTimeout(() => {
		const outerContainer = document.getElementById('outerContainer');
		if (outerContainer) {
			// Ensure sidebar stays closed
			outerContainer.classList.remove('sidebarOpen');
			
			// Reset to automatic zoom after sidebar is closed
			setTimeout(() => {
				resetToAutomaticZoom();
			}, 100);
		}
	}, 100);
});

// Function to reset to automatic zoom
function resetToAutomaticZoom() {
	// Check if PDFViewerApplication is available
	if (window.PDFViewerApplication && window.PDFViewerApplication.pdfViewer) {
		const pdfViewer = window.PDFViewerApplication.pdfViewer;
		
		// Set to automatic zoom (this will automatically fit the page to the container)
		pdfViewer.currentScale = 'auto';
	}
}
