import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'recent-git-urls';
const MAX_RECENT_URLS = 5;

function createRecentUrlsStore() {
	const { subscribe, set, update } = writable<string[]>([]);

	// Load from localStorage on initialization
	if (browser) {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				const urls = JSON.parse(stored);
				if (Array.isArray(urls)) {
					set(urls);
				}
			} catch (e) {
				console.warn('Failed to parse stored recent URLs:', e);
			}
		}
	}

	return {
		subscribe,
		addUrl: (url: string) => {
			update((urls) => {
				// Remove if already exists
				const filtered = urls.filter((u) => u !== url);
				// Add to beginning
				const updated = [url, ...filtered].slice(0, MAX_RECENT_URLS);

				// Save to localStorage
				if (browser) {
					localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
				}

				return updated;
			});
		},
		removeUrl: (url: string) => {
			update((urls) => {
				const updated = urls.filter((u) => u !== url);

				// Save to localStorage
				if (browser) {
					localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
				}

				return updated;
			});
		},
		clear: () => {
			set([]);
			if (browser) {
				localStorage.removeItem(STORAGE_KEY);
			}
		}
	};
}

export const recentUrls = createRecentUrlsStore();
