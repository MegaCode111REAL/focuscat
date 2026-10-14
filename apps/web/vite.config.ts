import contentCollections from '@content-collections/vite';
import mdx from '@mdx-js/rollup';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig(async () => ({
	server: {
		port: 3000
	},
	resolve: {
		tsconfigPaths: true
	},
	define: {
		['import.meta.env.PACKAGE_VERSION']: validateAndStringify('npm_package_version')
	},
	plugins: [
		contentCollections(),
		mdx(),
		tanstackStart({
			srcDirectory: 'src'
		}),
		nitro({
			routeRules: {
				// Note: Cache assets in the browser to reduce repeated CDN requests
				'/illustrations/cat/**': {
					headers: { 'cache-control': 'public, max-age=86400, must-revalidate' }
				},
				'/audio/**': {
					headers: { 'cache-control': 'public, max-age=86400, must-revalidate' }
				}
			}
		}),
		viteReact(),
		tailwindcss()
	]
}));

/**
 * Validate and stringify env var for Vite's `define` option
 * - Production: Fail hard if missing (prevent corrupted builds)
 * - Development: Allow empty string (warn but continue)
 */
function validateAndStringify(key: string): string {
	const value = process.env[key];
	if (!value?.length) {
		// Production builds must have all env vars
		const isProd = process.env['CI'] || process.env['DOCKER'];
		if (isProd) {
			throw new Error(`${key} is required for production builds`);
		}
		// Local dev: warn and continue with empty string
		console.warn(`[vite.config.ts] Warning: ${key} is not set`);
		return JSON.stringify('');
	}
	return JSON.stringify(value);
}
