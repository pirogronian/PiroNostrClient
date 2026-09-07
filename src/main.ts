
import { App } from "./App.js"

console.log("Reloading with url:", window.location.href)

const app = new App()

globalThis.app = app

app.login()
app.connect()
app.setupLocation()
app.initRouting()
app.initUI()
