
import Navigo from "navigo";
import NDK, { NDKEvent, NDKRelay, NDKRelayStatus, NDKUser } from "@nostr-dev-kit/ndk";
import $ from "jquery"

import { App } from "@/App.js"
import { EventTagValues, InnerUrl, InnerLink, MakeLinkInner } from "@/various.js"

import "@/style.scss"

import HomeHTML from "@/Home.html?raw"
import SettingsHTML from "@/Settings.html?raw"
import ActiveRelayHTML from "@/ActiveRelay.html?raw"

import { ReadonlyValue } from "vanilla-jsoneditor";

const MainViewId = "MainView"
const RelaysListId = "RelaysList"

export class UI {
    ndk: NDK

    constructor(ndk: NDK) {
        this.ndk = ndk
    }

    mainView() {
        return $(`#${MainViewId}`)
    }

    init() {
        MakeLinkInner($("a#HomeLink"), "/")
        MakeLinkInner($("a#SettingsLink"), "/settings")
    }

    initLinks() {
        console.log("Init links.")
        $("a.inner").click((event) => {
            console.log("Inner link clicked.")
            event.preventDefault()
            App.get().router.navigate($(event.currentTarget).attr("inner"))
        })
    }

    clear() {
        this.mainView().html("")
    }

    home() {
        this.mainView().html(HomeHTML)
    }

    Relays() : void {
        const relays = App.get().relays
        const list = relays.get()
        const Head = $("#ActiveRelaysHeader")
        const UIList = $("#ActiveRelays")

        const NewUrl = $("input[name='NewRelayUrl']")
        Head.find("#AddRelayButton").click((e) => {
            relays.add(NewUrl.val())
            relays.save()
            this.Relays()
        })
        Head.find("#RefreshActiveRelays").click(() => {
            this.Relays()
        })

        UIList.html("")

        list.forEach((relay : NDKRelay) => {
            const arn = $(ActiveRelayHTML)
            console.log("Relay:", relay.url)
            arn.find("a").text(relay.url).attr("href", relay.url)
            let c: string = NDKRelayStatus[relay.status]
            c = c.toLocaleLowerCase()
            const s = arn.find(".RelayStatus")
            s.text(c)
            s.addClass(c)
            arn.find("button.RemoveRelayButton").click((e) => {
                console.log("Removing:", relay.url)
                relays.remove(relay.url)
                relays.save()
                this.Relays()
            })

            UIList.append(arn)
        })
    }

    settings() {
        this.mainView().html(SettingsHTML)
    }

}
