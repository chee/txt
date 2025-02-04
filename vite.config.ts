import {defineConfig, type UserConfig} from "vite"
import {VitePWA as pwa} from "vite-plugin-pwa"
import wasm from "vite-plugin-wasm"
import * as path from "path"

export const config: UserConfig = {
	plugins: [
		wasm(),
		pwa({
			registerType: "autoUpdate",
			injectRegister: false,
			pwaAssets: {
				disabled: false,
				config: true,
			},
			manifest: {
				name: "txt",
				short_name: "txt",
				description: "a text file",
				theme_color: "#282a36",
				// todo back and forward buttons
				display: "fullscreen",
				background_color: "#282a36",
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm}"],
				cleanupOutdatedCaches: false,
				clientsClaim: true,
				maximumFileSizeToCacheInBytes: 999999999999999,
				additionalManifestEntries: [],
				skipWaiting: true,
			},
			devOptions: {
				enabled: true,
				navigateFallback: "index.html",
				suppressWarnings: true,
				type: "module",
			},
		}),
	],
	build: {
		outDir: "output",
		emptyOutDir: true,
		sourcemap: "hidden",
		minify: true,
		target: ["firefox127", "safari17"],
		rollupOptions: {
			input: {
				main: path.resolve(import.meta.dirname, "index.html"),
				html: path.resolve(import.meta.dirname, "html/index.html"),
				preview: path.resolve(import.meta.dirname, "preview/index.html"),
			},
		},
	},
	css: {
		preprocessorOptions: {
			scss: {
				includePaths: ["node_modules"],
			},
		},
	},
}

export default defineConfig(config)
