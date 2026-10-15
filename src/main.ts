
import { Event } from "./Event.js"
import { Subscription } from "./Subscription.js"
import { App } from "@/App.js"

Event.setup()
Subscription.setup()

console.log("Reloading with url:", window.location.href)

const app = new App()

app.setupLocation()
app.initRouting()
app.login()
app.setup()
//app.connect()
