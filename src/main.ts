
import { Piro } from "./Piro.js"

console.log("Reloading with url:", window.location.href)

const p = new Piro()

globalThis.piro = p

p.login()
p.connect()
p.initRouting()
