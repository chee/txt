import {defineConfig, type UserConfig} from "vite"
import {VitePWA as pwa} from "vite-plugin-pwa"
import wasm from "vite-plugin-wasm"

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
				name: "html",
				short_name: "html",
				description: "an html file",
				theme_color: "#000000",
				// todo back and forward buttons
				display: "fullscreen",
				background_color: "#ffffff",
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm}"],
				cleanupOutdatedCaches: false,
				clientsClaim: true,
				maximumFileSizeToCacheInBytes: 999999999999999,
				additionalManifestEntries: [],
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
