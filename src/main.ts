import {registerSW} from "virtual:pwa-register"
registerSW({immediate: true})
import {automergeSyncPlugin} from "@automerge/automerge-codemirror"
import {
	Decoration,
	drawSelection,
	EditorView,
	highlightActiveLine,
	highlightSpecialChars,
	keymap,
	type DecorationSet,
	type KeyBinding,
	type ViewUpdate,
} from "@codemirror/view"
import {minimalSetup} from "codemirror"
import {markdown, markdownLanguage} from "@codemirror/lang-markdown"
import {dracula} from "@uiw/codemirror-theme-dracula"
import {
	bracketMatching,
	indentOnInput,
	LanguageDescription,
	syntaxHighlighting,
} from "@codemirror/language"
import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
} from "@codemirror/commands"
import {
	StateField,
	EditorState,
	Compartment,
	type StateCommand,
	EditorSelection,
	Text,
	Transaction,
} from "@codemirror/state"
import HashFollower from "./follow.ts"
import startAutomerge from "./start.ts"
import {githubLight as github} from "@uiw/codemirror-theme-github"
import {classHighlighter, tags} from "@lezer/highlight"
import {HighlightStyle} from "@codemirror/language"
import {
	closeBrackets,
	autocompletion,
	closeBracketsKeymap,
	completionKeymap,
} from "@codemirror/autocomplete"

let featureflags = new URLSearchParams(location.search.slice(1))
for (let [flag, value] of featureflags.entries()) {
	document.documentElement.setAttribute(flag, value)
}

const wysish = HighlightStyle.define([
	{
		tag: tags.content,
		fontFamily: "system-ui, sans-serif",
	},
	{
		tag: tags.monospace,
		fontFamily: "iosevka, monospace",
	},
	{
		tag: tags.heading1,
		fontSize: "2em",
		fontWeight: "bold",
		fontFamily: "system-ui, sans-serif",
	},
	{
		tag: tags.heading2,
		fontSize: "1.75em",
		fontWeight: "bold",
		fontFamily: "system-ui, sans-serif",
	},
	{
		tag: tags.heading3,
		fontSize: "1.5em",
		fontWeight: "bold",
		fontFamily: "system-ui, sans-serif",
	},
	{
		tag: tags.heading4,
		fontSize: "1.25em",
		fontWeight: "bold",
		fontFamily: "system-ui, sans-serif",
	},
	{
		tag: tags.heading5,
		fontSize: "1.125em",
		fontWeight: "bold",
		fontFamily: "system-ui, sans-serif",
	},
	{
		tag: tags.heading6,
		fontWeight: "bold",
		fontFamily: "system-ui, sans-serif",
	},
])

let txt = document.getElementById("txt")!

if (featureflags.has("rtl")) {
	txt.style.direction = "rtl"
}
if (featureflags.has("name")) {
	localStorage.setItem("name", featureflags.get("name") ?? "")
}
if (featureflags.has("name")) {
	localStorage.setItem("name", featureflags.get("name") ?? "")
}

let repo = await startAutomerge()

let hash = new HashFollower(repo)
await hash.ready

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
		hash.docHandle?.broadcast({
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
			updateDOM(_dom, _view) {
				return true
			},
			ignoreEvent(_event) {
				return true
			},
			estimatedHeight: -1,
			lineBreaks: 0,
			coordsAt(_dom, _pos, _side) {
				return {bottom: 0, left: 0, right: 0, top: 0}
			},
			toDOM(_view) {
				let span = document.createElement("span")
				span.className = "cm-friend cm-friend-point"
				return span
			},
			destroy() {
				return
			},
			compare(w) {
				return w == this
			},
		},
	})
	friendPointMark.point = true

	return StateField.define<DecorationSet>({
		create(state) {
			hash.docHandle?.on("ephemeral-message", payload => {
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
			hash.docHandle?.broadcast({type: "$hello"})
			return Decoration.none
		},

		update(marks, tr) {
			marks = marks.update({
				filter() {
					return false
				},
			})

			for (let [id, range] of Object.entries(friends)) {
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

let darkmatch = window.matchMedia("(prefers-color-scheme: dark)")
let theme = new Compartment()
function getSchemeTheme() {
	return darkmatch.matches ? dracula : github
}
function onschemechange(event: MediaQueryListEvent) {
	view?.dispatch({
		effects: theme.reconfigure(getSchemeTheme()),
	})
}
darkmatch.addEventListener("change", onschemechange)

function title(update: ViewUpdate) {
	if (update.docChanged) {
		setHeadline(update.view.state)
	}
}

function keybindings() {
	function toggleInline(mark: string) {
		let len = mark.length
		// adapted https://discuss.codemirror.net/t/keymap-for-bold-text-in-lang-markdown/3150/3
		// todo if selection is point this should select the word
		let toggler: StateCommand = ({state, dispatch}) => {
			let changes = state.changeByRange(range => {
				let isMarkedBefore =
					state.sliceDoc(range.from - len, range.from) === mark
				let isMarkedAfter = state.sliceDoc(range.to, range.to + len) === mark
				let changes = []

				changes.push(
					isMarkedBefore
						? {
								from: range.from - len,
								to: range.from,
								insert: Text.of([""]),
						  }
						: {
								from: range.from,
								insert: Text.of([mark]),
						  }
				)

				changes.push(
					isMarkedAfter
						? {
								from: range.to,
								to: range.to + len,
								insert: Text.of([""]),
						  }
						: {
								from: range.to,
								insert: Text.of([mark]),
						  }
				)

				let extendBefore = isMarkedBefore ? -len : len
				let extendAfter = isMarkedAfter ? -len : len

				return {
					changes,
					range: EditorSelection.range(
						range.from + extendBefore,
						range.to + extendAfter
					),
				}
			})

			dispatch(
				state.update(changes, {
					scrollIntoView: true,
					annotations: Transaction.userEvent.of("input"),
				})
			)

			return true
		}
		return toggler
	}

	const bindings: KeyBinding[] = [
		{
			key: "Mod-b",
			run: toggleInline("**"),
			preventDefault: true,
			stopPropagation: true,
		},
		{
			key: "Mod-i",
			run: toggleInline("__"),
			preventDefault: true,
			stopPropagation: true,
		},
	]

	return bindings
}

function setupView() {
	return new EditorView({
		doc: hash.docHandle!.docSync()!.text,
		extensions: [
			theme.of(getSchemeTheme()),
			EditorView.lineWrapping,
			EditorView.updateListener.of(ephemera),
			EditorView.updateListener.of(title),
			cursors(),
			// minimalSetup(),
			automergeSyncPlugin({
				handle: hash.docHandle!,
				path: ["text"],
			}),
			indentOnInput(),
			bracketMatching(),
			highlightSpecialChars(),
			history(),
			drawSelection(),
			autocompletion(),
			closeBrackets(),
			syntaxHighlighting(wysish),

			highlightActiveLine(),
			EditorState.allowMultipleSelections.of(true),

			keymap.of([
				...closeBracketsKeymap,
				...defaultKeymap,
				...historyKeymap,
				...defaultKeymap,
				...historyKeymap,
				...completionKeymap,
				...keybindings(),
			]),
			markdown({
				base: markdownLanguage,
				addKeymap: true,
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
			EditorView.contentAttributes.of({
				autocorrect: "on",
				autocapitalize: "on",
				spellcheck: "true",
			}),
			keymap.of([indentWithTab]),
		],
		parent: txt,
	})
}

let view = setupView()

function setHeadline(state: EditorState) {
	let headline = state.doc.line(1).text.replace(/^#+ ?/, "")
	if (!window.top) {
		return
	}
	if (headline) {
		window.top.document.head.querySelector("title")!.textContent =
			headline + " | txt"
	} else {
		window.top.document.head.querySelector("title")!.textContent = "txt"
	}
}

setHeadline(view.state)

hash.sub(() => {
	view.destroy()
	view = setupView()
})

setInterval(() => {
	broadcast(view.state)
}, 1000)

view.focus()

window.repo = repo

window.addEventListener("click", () => view.focus())
function highlightSelectionMatches(): import("@codemirror/state").Extension {
	throw new Error("Function not implemented.")
}
