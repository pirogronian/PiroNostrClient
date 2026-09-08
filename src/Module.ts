
import $ from "jquery"
import Navigo from "navigo"
import NDK from "@nostr-dev-kit/ndk"
import { Router } from "@/Router.js"
import { InnerUrl, InnerLink, MakeLinkInner } from "./various.js"

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

    navigate(addr: string) {
        console.log("Module.navigate:", addr)
        this.router?.navigate(this.url(addr))
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

    url(addr: string): string {
        return this.routingPath.concat(addr)
    }

    innerUrl(addr: string): string {
        return InnerUrl(this.url(addr))
    }

    innerLink(addr: string, text: string) {
        return `<a inner="${addr}" class="inner" href=${this.innerUrl(addr)}>${text}</a>`
    }

    makeLinkInner(node, addr: string, text: string|undefined|null = null) {
        node.attr("inner", addr)
        node.attr("href", this.innerUrl(addr))
        node.attr("class", "inner")
        if (text !== null)
            node.text(text)
        return node
    }

    activeLink(addr: string, text: string) {
        const link = $(this.innerLink(addr, text))
        link.click((e) => {
            e.preventDefault()
            this.navigate($(e.currentTarget).attr("inner"))
        })
    }

    makeLinkActive(node, addr: string, text: string|undefined|null = null) {
        const link = this.makeLinkInner(node, addr, text)
        link.click((e) => {
            e.preventDefault()
            this.navigate($(e.currentTarget).attr("inner"))
        })
    }
}
