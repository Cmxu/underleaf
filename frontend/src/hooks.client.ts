import { dev } from '$app/environment';

// Enhanced error handling for production
if (!dev) {
	console.log = () => {};
	console.warn = () => {};
}

// Global error handler
window.addEventListener('unhandledrejection', (event) => {
	console.error('Unhandled promise rejection:', event.reason);
	// In production, you might want to send this to an error tracking service
});

// Performance monitoring (development only)
if (dev) {
	let startTime = performance.now();
	
	window.addEventListener('load', () => {
		const loadTime = performance.now() - startTime;
		console.log(`🚀 App loaded in ${loadTime.toFixed(2)}ms`);
	});
}