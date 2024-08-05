import {
	isValidAutomergeUrl,
	type AutomergeUrl,
	type DocHandle,
	type Repo,
} from "@automerge/automerge-repo/slim"

type TextDocument = {text: string}

async function getDocHandleFromHash(
	repo: Repo
): Promise<DocHandle<TextDocument>> {
	let docUrl = location.hash.slice(1) as AutomergeUrl
	if (!docUrl || !isValidAutomergeUrl(docUrl)) {
		docUrl = repo.create({text: ""}).url
		location.hash = docUrl
	}

	let docHandle = repo.find<TextDocument>(docUrl)
	await docHandle.whenReady()

	return docHandle
}

export default class FollowHash {
	#doc: DocHandle<TextDocument> | undefined
	get docHandle() {
		return this.#doc
	}
	readonly ready: Promise<void>
	#subs = new Set<() => void>()
	constructor(repo: Repo) {
		this.ready = new Promise(yay => {
			getDocHandleFromHash(repo).then(doc => {
				this.#doc = doc
				yay()
			})
		})
		window.addEventListener("hashchange", async () => {
			this.#doc = await getDocHandleFromHash(repo)
			for (let sub of this.#subs) {
				sub()
			}
		})
	}
	sub(fn: () => void) {
		this.#subs.add(fn)
		return () => this.#subs.delete(fn)
	}
}
