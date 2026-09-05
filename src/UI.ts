
import Navigo from "navigo";
import NDK, { NDKEvent, NDKRelay, NDKUser } from "@nostr-dev-kit/ndk";
import $ from "jquery"

import { ArticleView } from "./ArticleView.js";

import SettingsHTML from "./Settings.html?raw"
import FinderHTML from "./Finder.html?raw"
import ArtHeadHTML from "./ArticleHeader.html?raw"

const MainViewId = "MainView"
const RelaysListId = "RelaysList"

export class UI {
    ndk: NDK
    artv: ArticleView

    constructor(ndk: NDK) {
        this.ndk = ndk
        this.artv = new ArticleView(this)
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

    error(msg: string) {
        $("#Message").text(`Error: ${msg}`)
    }

    user(user: NDKUser | null, handlers: { onLogin: (method: string) => any, onLogout: () => any}) {
        const LoginForm = $("#Login")
        const UserHTML = $("#LoggedUser")
        const NickHtml = $("#LoggedUserNick")
        const PubkeyHtml = $("#LoggedUserPubkey")
        if (user) {
            LoginForm.hide()
            UserHTML.show()
            NickHtml.text(user.profile?.name || user.profile?.displayName || "")
            PubkeyHtml.text(user.pubkey)
            $("#Logout").click(() => { handlers.onLogout() })
        } else {
            UserHTML.hide()
            NickHtml.text("")
            PubkeyHtml.text("")
            LoginForm.show()
            $("#LoginMethodSelect").change((e) => {
                handlers.onLogin($(e.currentTarget).val())
            })
        }
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
        const form = $("#FinderForm")
        form.submit((e) => {
            e.preventDefault()
            const formData = new FormData(form.get(0));
            const searchParams = new URLSearchParams();
            for (const [key, value] of formData.entries()) {
                if (value) {
                    searchParams.append(key, value.toString());
                }
            }
            const url = searchParams.toString()
            router.navigate(`/articles?${url}`)
        })
    }

    async ArticleHead(event: NDKEvent, relay?: NDKRelay) : void {
        const Head = $(ArtHeadHTML)
        const title = Head.find(".ArticleTitle")
        let TT = event.tagValue("title")
        if (!TT) { TT = event.tagValue("d") }
        console.log(`Received article "${TT}"`)
        title.text(TT)
        title.attr("href", `/article/${event.encode()}`)

        const user = await this.ndk.fetchUser(event.pubkey)
        if (user) {
            await user.fetchProfile()
            if (user.profile) {
                Head.find("a.AuthorNick").text(user.profile.name).attr("href", `/articles?author=${user.pubkey}`)
                Head.find("img.AuthorImg").attr("src", user.profile.picture)
            }
        }

        this.mainView().append(Head)
    }

    article(event: NDKEvent) {
        this.artv.setEvent(event)
        this.artv.show()
    }
}
