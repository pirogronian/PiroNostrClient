
import Navigo from "navigo";
import NDK, { NDKEvent, NDKRelay, NDKRelayStatus, NDKUser } from "@nostr-dev-kit/ndk";
import $ from "jquery"

import { App } from "./App.js"
import { EventTagValues, InnerUrl, InnerLink, MakeLinkInner } from "./various.js"

import "./style.scss"

import HomeHTML from "./Home.html?raw"
import SettingsHTML from "./Settings.html?raw"
import ActiveRelayHTML from "./ActiveRelay.html?raw"
import FinderHTML from "./Finder.html?raw"
import FinderTagInputs from "./FinderTagInputs.html?raw"
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
        MakeLinkInner($("a#SearchLink"), "/search")
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

    isFinder(): boolean {
        return $("form#FinderForm").html()
    }

    async finder() {
        const o = $(FinderHTML)
        this.mainView().append(o)
        const form = $("#FinderForm")
        form.prop("action", InnerUrl("/articles"))
        const me = form.find("button#FinderAuthorMe")
        const user = await App.get().user.get(null, false)
        if (user && user.pubkey) {
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
            o.find("label").attr("for", tag).text(`Tag "${tag}:"`)
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
            App.get().router.navigate(`/articles?${url}`)
        })
        /*form.find("input").on("keydown", function(e){
            console.log("Pressed key in input:", e.key)
            if (e.key === "Enter")
                console.log("Enter pressed in input field.")
        })*/
    }

    clearFinderResult() {
        $("#FinderResult").html("")
    }

    article(event: NDKEvent) {
        this.artv.setEvent(event)
        this.artv.show()
    }
}
