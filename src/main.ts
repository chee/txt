import {registerSW} from "virtual:pwa-register"
registerSW({immediate: true})
import {
	isValidAutomergeUrl,
	type AutomergeUrl,
	type PeerId,
} from "@automerge/automerge-repo/slim"
import {automergeSyncPlugin} from "@automerge/automerge-codemirror"
import {
	Decoration,
	EditorView,
	type DecorationSet,
	type ViewUpdate,
} from "@codemirror/view"
import {minimalSetup} from "codemirror"
import {markdown} from "@codemirror/lang-markdown"
import {dracula} from "@uiw/codemirror-theme-dracula"
import {BrowserWebSocketClientAdapter} from "@automerge/automerge-repo-network-websocket"
import {BroadcastChannelNetworkAdapter} from "@automerge/automerge-repo-network-broadcastchannel"
import {IndexedDBStorageAdapter} from "@automerge/automerge-repo-storage-indexeddb"
import {Repo} from "@automerge/automerge-repo"
import {LanguageDescription} from "@codemirror/language"
import {Tooltip, showTooltip} from "@codemirror/view"
import {StateField, EditorState} from "@codemirror/state"

let txt = document.getElementById("txt")!

let featureflags = new URLSearchParams(location.search.slice(1))
for (let [flag, value] of featureflags.entries()) {
	document.documentElement.setAttribute(flag, value)
}
if (featureflags.has("rtl")) {
	txt.style.direction = "rtl"
}
if (featureflags.has("name")) {
	localStorage.setItem("name", featureflags.get("name") ?? "")
}
if (featureflags.has("name")) {
	localStorage.setItem("name", featureflags.get("name") ?? "")
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
	peerId: (localStorage.getItem("name") as PeerId) ?? undefined,
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

type Range = {
	from: number
	to: number
	head: number
	anchor: number
}

type RangeMessage = Range & {$type: "range"}
type HelloMessage = {$type: "hello"}
type AnyMessage = RangeMessage | HelloMessage

function broadcast(state: EditorState) {
	for (let range of state.selection.ranges) {
		docHandle.broadcast({
			$type: "range",
			from: range.from,
			to: range.to,
			head: range.head,
			anchor: range.anchor,
		} satisfies RangeMessage)
	}
}

function ephemera(update: ViewUpdate) {
	if (update.selectionSet) {
		broadcast(update.state)
	}
}

function cursors() {
	let friends: Record<string, Range & {time: number}> = {}
	let friendRangeMark = Decoration.mark({
		class: "cm-friend cm-friend-range",
	})
	let friendPointMark = Decoration.widget({
		widget: {
			eq(widget) {
				return widget == this
			},
			updateDOM(dom, view) {
				return true
			},
			ignoreEvent(event) {
				return true
			},
			estimatedHeight: -1,
			lineBreaks: 0,
			coordsAt(dom, pos, side) {
				return {bottom: 0, left: 0, right: 0, top: 0}
			},
			toDOM(view) {
				let span = document.createElement("span")
				span.className = "cm-friend cm-friend-point"
				return span
			},
			destroy() {
				return
			},
		},
	})
	friendPointMark.point = true

	return StateField.define<DecorationSet>({
		create(state) {
			docHandle.on("ephemeral-message", payload => {
				let id = payload.senderId
				let message = payload.message as AnyMessage
				if (message.$type == "range") {
					friends[id] = {
						...message,
						time: Date.now(),
					}
				}
				if (message.$type == "hello") {
					broadcast(state)
				}
			})
			docHandle.broadcast({type: "$hello"})
			return Decoration.none
		},

		update(marks, tr) {
			marks.map(tr.changes)
			marks = marks.update({
				filter() {
					return false
				},
			})

			for (let [id, range] of Object.entries(friends)) {
				console.log(Date.now() - range.time > 2000, Date.now(), range.time)
				if (Date.now() - range.time > 2000) {
					delete friends[id]
					continue
				}
				let mark =
					range.from == range.to
						? friendPointMark.range(range.from)
						: friendRangeMark.range(range.from, range.to)
				mark.value.spec.id = id
				marks = marks.update({
					add: [mark],
				})
			}

			marks = marks.update({
				filter(from, to, value) {
					if (value.spec.id in friends) {
						return true
					}
					return false
				},
			})

			return marks
		},

		provide: f => EditorView.decorations.from(f),
	})
}

function setupView() {
	return new EditorView({
		doc: docHandle.docSync()!.text,
		extensions: [
			EditorView.updateListener.of(ephemera),
			cursors(),
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

setInterval(() => {
	broadcast(view.state)
}, 1000)

view.focus()

window.addEventListener("hashchange", async () => {
	docHandle = await followHash()
	view.destroy()
	view = setupView()
})

window.repo = repo

window.addEventListener("click", () => view.focus())
