// Custom JavaScript to auto-open sidebar with thumbnails on the right
document.addEventListener('DOMContentLoaded', function () {
	// Wait for PDF.js to initialize
	const initializeSidebar = () => {
		// Add sidebarOpen class to enable the sidebar
		const outerContainer = document.getElementById('outerContainer');
		if (outerContainer) {
			outerContainer.classList.add('sidebarOpen');

			// Make sure thumbnails are selected
			const thumbnailButton = document.getElementById('viewThumbnail');
			if (thumbnailButton && !thumbnailButton.classList.contains('toggled')) {
				thumbnailButton.click();
			}
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
			outerContainer.classList.add('sidebarOpen');
		}
	}, 100);
});
