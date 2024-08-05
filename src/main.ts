import {registerSW} from "virtual:pwa-register"
registerSW({immediate: true})
import {
	isValidAutomergeUrl,
	type AutomergeUrl,
} from "@automerge/automerge-repo/slim"
import {automergeSyncPlugin} from "@automerge/automerge-codemirror"
import {EditorView} from "@codemirror/view"
import {minimalSetup} from "codemirror"
import {markdown} from "@codemirror/lang-markdown"
import {dracula} from "@uiw/codemirror-theme-dracula"
import {BrowserWebSocketClientAdapter} from "@automerge/automerge-repo-network-websocket"
import {BroadcastChannelNetworkAdapter} from "@automerge/automerge-repo-network-broadcastchannel"
import {IndexedDBStorageAdapter} from "@automerge/automerge-repo-storage-indexeddb"
import {Repo} from "@automerge/automerge-repo"
import {LanguageDescription} from "@codemirror/language"

let txt = document.getElementById("txt")!

let featureflags = new URLSearchParams(location.search.slice(1))
for (let [flag, value] of featureflags.entries()) {
	document.documentElement.setAttribute(flag, value)
}
if (featureflags.has("rtl")) {
	txt.style.direction = "rtl"
}

let idb = new IndexedDBStorageAdapter("lb-docs")
let socky = new BrowserWebSocketClientAdapter(
	`wss://autosync-rdd6.onrender.com`
)
let tabby = new BroadcastChannelNetworkAdapter()
let network = [socky, tabby]
let storage = idb
let repo = new Repo({
	network,
	storage,
})
await new Promise<void>(yay => repo.networkSubsystem.once("ready", yay))

async function followHash() {
	let docUrl = location.hash.slice(1) as AutomergeUrl
	if (!docUrl || !isValidAutomergeUrl(docUrl)) {
		docUrl = repo.create({text: ""}).url
		location.hash = docUrl
	}

	let docHandle = repo.find<{text: string}>(docUrl)
	await docHandle.whenReady()
	return docHandle
}

let docHandle = await followHash()

function setupView() {
	return new EditorView({
		doc: docHandle.docSync()!.text,
		extensions: [
			minimalSetup,
			automergeSyncPlugin({
				handle: docHandle,
				path: ["text"],
			}),
			markdown({
				codeLanguages: [
					LanguageDescription.of({
						name: "javascript",
						alias: ["js", "jsx", "ts", "tsx", "typescript"],
						filename: /\.[jt]sx?$/,
						async load() {
							return import("@codemirror/lang-javascript").then(mod =>
								mod.javascript()
							)
						},
					}),
					LanguageDescription.of({
						name: "html",
						filename: /\.html$/,
						async load() {
							return import("@codemirror/lang-html").then(mod => mod.html())
						},
					}),
					LanguageDescription.of({
						name: "python",
						alias: ["py"],
						filename: /\.py$/,
						async load() {
							return import("@codemirror/lang-python").then(mod => mod.python())
						},
					}),
					LanguageDescription.of({
						name: "css",
						alias: ["style"],
						filename: /\.css$/,
						async load() {
							return import("@codemirror/lang-css").then(mod => mod.css())
						},
					}),
					LanguageDescription.of({
						name: "sass",
						alias: ["scss"],
						filename: /\.s[ca]ss$/,
						async load() {
							return import("@codemirror/lang-sass").then(mod => mod.sass())
						},
					}),
					LanguageDescription.of({
						name: "sql",
						filename: /\.sql$/,
						async load() {
							return import("@codemirror/lang-sql").then(mod => mod.sql())
						},
					}),
					LanguageDescription.of({
						name: "go",
						filename: /\.go$/,
						async load() {
							return import("@codemirror/lang-go").then(mod => mod.go())
						},
					}),
					LanguageDescription.of({
						name: "json",
						filename: /\.json$/,
						async load() {
							return import("@codemirror/lang-json").then(mod => mod.json())
						},
					}),
					LanguageDescription.of({
						name: "rust",
						alias: ["rs"],
						filename: /\.rust$/,
						async load() {
							return import("@codemirror/lang-rust").then(mod => mod.rust())
						},
					}),
					LanguageDescription.of({
						name: "cpp",
						alias: ["c"],
						filename: /\.c([px]{2})?$/,
						async load() {
							return import("@codemirror/lang-cpp").then(mod => mod.cpp())
						},
					}),
				],
			}),
			dracula,
		],
		parent: txt,
	})
}

let view = setupView()

view.focus()

window.addEventListener("hashchange", async () => {
	docHandle = await followHash()
	view.destroy()
	view = setupView()
})

window.repo = repo

window.addEventListener("click", () => view.focus())
