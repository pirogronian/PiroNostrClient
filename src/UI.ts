
import Navigo from "navigo";
import NDK, { NDKEvent, NDKRelay, NDKUser } from "@nostr-dev-kit/ndk";
import $ from "jquery"

import { ArticleView } from "./ArticleView.js";
import { EventTagValues, LocalUrl } from "./various.js"

import HomeHTML from "./Home.html?raw"
import SettingsHTML from "./Settings.html?raw"
import FinderHTML from "./Finder.html?raw"
import FinderTagInputs from "./FinderTagInputs.html?raw"
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

    init() {
        $("a#HomeLink").attr("href", LocalUrl("#/"))
        $("a#SearchLink").attr("href", LocalUrl("#/search"))
        $("a#SettingsLink").attr("href", LocalUrl("#/settings"))
    }

    initLinks(router: Navigo) {
        $("a.a").click(function(event) {
            event.preventDefault()
            router.navigate($(this).attr("href"), { callHandler: true })
            //router.navigate($(this).attr("href"))
        })
    }

    clear() {
        this.mainView().html("")
    }

    clearMessage() {
        $("#Message").text("")
    }

    error(msg: string) {
        $("#Message").text(`Error: ${msg}`)
    }

    time(seconds: number|undefined|null = null) {
        let t: Date|null = null
        if (seconds) {
            seconds *= 1000;
            t = new Date(seconds)
        }
        t = new Date()
        return t.toLocaleString()
    }

    home() {
        this.mainView().html(HomeHTML)
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

    async finder(router: Navigo, replace: boolean = false) {
        if ($("#FinderForm").html() && !replace)
            return
        const o = $(FinderHTML)
        this.mainView().append(o)
        const form = $("#FinderForm")
        form.prop("action", LocalUrl("#/articles"))
        const me = form.find("button#FinderAuthorMe")
        const user = await globalThis.piro.user.get(null, false)
        if (user.pubkey) {
            const ai = form.find("input[name='author']")
            me.click(function() {
                ai.val(user.pubkey)
            })
        } else me.hide()
        const fft = form.find("#FinderFormTags")
        form.find("button#AddSearchTag").click(() => {
            const tag = form.find("input[name='tag']").val()
            const val = form.find("input[name='tagvalue']").val()
            if (!tag) return;
            const o = $(FinderTagInputs)
            o.find("input").attr("name", tag).val(val)
            o.find("label").attr("for", tag).text(tag)
            o.find("button").attr("data", tag)
            o.find("button").click(function() {
                $(this).parent().remove()
            })
            fft.append(o)
        })
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
        if (!globalThis.piro.articles.enabled) return
        const Head = $(ArtHeadHTML)
        const title = Head.find(".ArticleTitle")
        let TT = event.tagValue("title")
        if (!TT) { TT = event.tagValue("d") }
        console.log(`Received article "${TT}"`)
        title.text(TT)
        title.attr("href", LocalUrl(`#/article/${event.encode()}`))

        const user = await globalThis.piro.user.get(event.pubkey)
        if (user && user.profile) {
            Head.find("a.AuthorNick").text(user.profile.name).attr("href", LocalUrl(`#/articles?author=${user.pubkey}`))
            Head.find("img.AuthorImg").attr("src", user.profile.picture)
            Head.find("div.CreationTime").text(this.time(event.created_at))
        }

        Head.find("div.Summary").text(event.tagValue("summary"))
        const topics = EventTagValues(event, "t")
        const HeadTopics = Head.find(".Topics")
        topics.forEach(function(topic) {
            const a = $(`<a href="${LocalUrl(`#/articles?t=${topic}`)}">${topic}</a>`)
            HeadTopics.append(a)
        })

        this.mainView().find("#FinderResult").append(Head)
    }

    clearFinderResult() {
        $("#FinderResult").html("")
    }

    article(event: NDKEvent) {
        this.artv.setEvent(event)
        this.artv.show()
    }
}
