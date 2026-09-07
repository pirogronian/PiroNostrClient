
import { App } from "./App.js"

console.log("Reloading with url:", window.location.href)

const app = new App()

app.login()
app.connect()
app.setupLocation()
app.initRouting()
app.initUI()
