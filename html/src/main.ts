import HashFollower from "../../src/follow.ts"
import startAutomerge from "../../src/start.ts"
import {marked} from "marked"
import {createStarryNight, common} from "@wooorm/starry-night"
import {toDom as dom} from "hast-util-to-dom"
let starryNight = await createStarryNight(common)

let repo = await startAutomerge()
let hash = new HashFollower(repo)
await hash.ready

async function updateHTML() {
	element.innerHTML = await marked.parse(hash.docHandle!.docSync()!.text)
	let nodes = Array.from(document.body.querySelectorAll("code"))

	for (const node of nodes) {
		let className = Array.from(node.classList).find(function (d) {
			return d.startsWith("language-")
		})
		if (!className) continue
		let scope = starryNight.flagToScope(className.slice(9))
		if (!scope) continue
		let tree = starryNight.highlight(node.textContent!, scope)
		node.replaceChildren(dom(tree, {fragment: true}))
	}
}

let element = document.getElementById("html")!
hash.docHandle?.on("change", async () => {
	updateHTML()
})
hash.sub(() => {
	updateHTML()
})

updateHTML()
