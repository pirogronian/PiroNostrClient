
import { NostrWiki } from "./Piro.js"

const nw = new NostrWiki()

nw.connect()
nw.initRouting()
nw.initHyperlinks()
