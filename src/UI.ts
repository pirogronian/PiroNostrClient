
import Navigo from "navigo";
import NDK, { NDKEvent, NDKRelay, NDKRelayStatus, NDKUser } from "@nostr-dev-kit/ndk";
import $ from "jquery"

import { App } from "@/App.js"
import { EventTagValues, InnerUrl, InnerLink, MakeLinkInner } from "@/various.js"

import "@/style.scss"

import HomeHTML from "@/Home.html?raw"

const MainViewId = "MainView"

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
}
