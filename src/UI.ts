
import Navigo from "navigo";
import NDK, { NDKEvent, NDKRelay } from "@nostr-dev-kit/ndk";
import $ from "jquery"

import SettingsHTML from "./Settings.html?raw"
import FinderHTML from "./Finder.html?raw"
import ArtHeadHTML from "./ArticleHeader.html?raw"

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

    initRouting(router: Navigo) {
        $("a").click(function(event) {
            event.preventDefault()
            router.navigate($(this).attr("href"))
        })
    }

    clear() {
        this.mainView().html("")
    }

    Relays() : void {
        const list = this.ndk.pool.relays;
        const ListHTML = $(`#${RelaysListId}`)

        console.log("Relays:", list.size)

        list.forEach((relay : NDKRelay) => {
            console.log("Relay:", relay.url)
            ListHTML.append(`<li>${relay.url}</li>`)
        })
    }

    settings() {
        this.mainView().html(SettingsHTML)
    }

    finder(router: Navigo) {
        this.mainView().html(FinderHTML)
        $("#FinderSubmit").click(function(event) {
            event.preventDefault()
            const id = $("#FinderId").val()
            const author = $("#FinderAuthor").val()
            let url: string = ""
            if (!id && !author) { url ="#/articles/" }
            if (id && !author) { url = `#/articles/id/${id}` }
            if (!id && author) { url = `#/articles/author/${author}` }
            if (id && author) { url =`#/articles/id/${id}/author/${author}` }
            router.navigate(url)
        })
    }

    ArticleHead(event: NDKEvent, relay?: NDKRelay) : void {
        const Head = $(ArtHeadHTML)
        const title = Head.find(".ArticleTitle")
        const TT = event.tagValue("title")
        if (!TT) { return }
        console.log(`Received article "${TT}"`)
        title.text(TT)
        title.attr("href", `#/article/${event.encode()}`)

        this.mainView().append(Head)
    }
}
