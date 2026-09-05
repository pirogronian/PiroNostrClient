
import { Piro } from "./Piro.js"

const p = new Piro()

globalThis.piro = p

p.login()
p.connect()
p.initRouting()
p.initHyperlinks()
