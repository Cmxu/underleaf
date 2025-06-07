import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
		host: true,
		proxy: {
			'/api': {
				target: 'http://localhost:3001',
				changeOrigin: true
			}
		}
	},
	preview: {
		port: 4173,
		host: true
	},
	build: {
		target: 'esnext',
		minify: 'esbuild',
		sourcemap: true
	},
	optimizeDeps: {
		include: ['@monaco-editor/loader']
	}
});
