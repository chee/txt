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

let idb = new IndexedDBStorageAdapter("lb-docs")
// let socky = new BrowserWebSocketClientAdapter(`wss://star.littlebook.app`)
let socky2 = new BrowserWebSocketClientAdapter(
	`wss://autosync-rdd6.onrender.com`
)
let tabby = new BroadcastChannelNetworkAdapter()
let network = [socky2, tabby]
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

let txt = document.getElementById("txt")!

function setupView() {
	return new EditorView({
		doc: docHandle.docSync()!.text,
		extensions: [
			minimalSetup,
			automergeSyncPlugin({
				handle: docHandle,
				path: ["text"],
			}),
			markdown(),
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
