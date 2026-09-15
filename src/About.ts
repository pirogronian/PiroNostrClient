
import $ from "jquery"
import { Module } from "./Module.js";
import { App } from "@/App.js"

import AboutHTML from "@/About.html?raw"

export class About extends Module {

    handle() {
        this.mainView().html(AboutHTML)
    }

    setup() {
        this.onRoute("", (match) => {
            this.setCurrent()
            this.handle()
        })
        this.makeLinkActive($("#AboutLink"), "")
    }
}
