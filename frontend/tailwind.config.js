/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				sans: ['Open Sans', 'system-ui', 'sans-serif']
			},
			colors: {
				dark: {
					50: '#f8f9fa',
					100: '#e9ecef',
					200: '#dee2e6',
					300: '#ced4da',
					400: '#adb5bd',
					500: '#6c757d',
					600: '#495057',
					700: '#343a40',
					800: '#2a2a2a',
					900: '#1f1f1f'
				}
			}
		}
	},
	plugins: [require('@tailwindcss/typography')]
};
