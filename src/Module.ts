
import $ from "jquery"
import Navigo from "navigo"
import NDK from "@nostr-dev-kit/ndk"
import { Router } from "./Router.js"

export class Module {
    settingsName!: string
    routingName!: string
    parent: Module|undefined
    settingsSeparator: string = "."
    routingSeparator: string = "/"
    settingsPath:string = ""
    routingPath:string = ""
    router: Router|null = null
    ndk!: NDK

    register(name: string, routingNane: string|null = null, parent: Module|undefined = undefined) {
        this.settingsName = name
        if (routingNane)
            this.routingName = routingNane
        else
            this.routingName = name
        this.parent = parent
        if (this.parent) {
            this.settingsPath = this.parent.settingsPath.concat(this.settingsSeparator).concat(this.settingsName)
            this.routingPath = this.parent.routingPath.concat(this.routingSeparator).concat(this.routingName)

            if (this.parent.router)
                this.router = this.parent.router

            if (this.parent.ndk)
                this.ndk = this.parent.ndk
        }

        this.setup()
    }

    settings(name: string, value: string|undefined|null = undefined): string|null|void {
        const ret: string|undefined = undefined
        const key = this.settingsPath.concat(this.settingsSeparator).concat(name)

        if (value) {
            return localStorage.setItem(key, value)
        }
        if (typeof value === "null") {
            return localStorage.removeItem(key)
        }
        return localStorage.getItem(key)
    }

    onRoute(pattern: string, f: Function) {
        this.router?.onRoute(this.routingPath.concat(pattern), f)
    }

    setup() {}

    mainView(content = null) {
        const mv = $("#MainView")
        if (content)
            mv.append(content)
        else
            return mv
    }

    hideMessages() {
        $("#Notice").hide()
        $("#Warning").hide()
        $("#Error").hide()
    }

    notice(msg: string) {
        const node = $("#Notice")
        node.find(".Message").text(msg)
        node.show()
    }

    warning(msg: string) {
        const node = $("#Warning")
        node.find(".Message").text(msg)
        node.show()
    }

    error(msg: string) {
        const node = $("#Error")
        node.find(".Message").text(msg)
        node.show()
    }

    clearUI() {
        this.hideMessages()
        this.mainView().empty()
    }
}
