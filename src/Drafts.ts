
import $ from "jquery"

import NDK, { NDKWiki, NDKDraft, NDKEvent, type NDKFilter, nip19 } from "@nostr-dev-kit/ndk";

import { FormattedTime, FormattedBytes } from "./various.js";

import { Module } from "@/Module.js"
import { App } from "@/App.js"

import DraftsMainHTML from "@/Drafts.html?raw"
import DraftItemHTMK from "@/DraftItem.html?raw"

import "@/Drafts.scss"

export class Drafts extends Module {
    onEvent(event: NDKEvent) {
        if (!this.isCurrent())  return
        if (event.kind != NDKDraft.kind) {
            console.warn("Got event not being a draft!")
            return
        }
        const draft = NDKDraft.from(event)
        const item = $(DraftItemHTMK)
        const id = item.find("a.DraftId")
        const addr = nip19.naddrEncode(draft)
        if (draft.content)  App.get().article.makeLinkActive(id, `/edit/${addr}`, draft.identifier)
        else id.text(draft.identifier)
        const crat = item.find(".DraftCreatedAt")
        crat.text(FormattedTime(draft.created_at))
        const rel = item.find(".Relay")
        rel.text(draft.relay?.url)
        const size = item.find(".DraftEventSize")
        size.text(FormattedBytes(draft.size()))
        const empty = item.find(".Empty")
        if (!draft.content) empty.hide()
        empty.click(() => {
            this.remove(draft)
        })

        const c = $("#DraftsList")
        c.append(item)

        const dn = $("#DraftsNumber")
        dn.text(c.children().length)
    }

    guiCreateMain() {
        this.mainView($(DraftsMainHTML))
    }

    remove(draft: NDKDraft) {
        const context = this.context
        draft.content = ""
        draft.tags = [["d", draft.identifier]]
        const p = draft.publishReplaceable()
        p.then(() => {
            if (!this.sameContext(context))  return
            this.navigate()
        })
    }

    async load() {
        const context = this.context
        const user = await App.get().user.get()
        if (!this.sameContext(context))  return;
        const pubkey = user?.pubkey
        if (!pubkey)  throw Error("No user pubkey!")
        const filter: NDKFilter = {
            kinds: [ NDKDraft.kind],
            authors: [ pubkey ]
        }
        this.ndk.subscribe(filter,
            { closeOnEose : true },
            { onEvent: (event) => { this.onEvent(event) } })
    }

    onLogin() {
        $("#DraftsLink").show()
    }

    onLogout() {
        $("#DraftsLink").hide()
    }

    setup() {
        this.onRoute("/", () => {
            this.setCurrent()
            this.newContext()
            this.clearUI()
            this.guiCreateMain()
            this.load()
        })
        this.makeLinkActive($("#DraftsLink"), "/")
        const u = App.get().user
        u.on("login", () => { this.onLogin() })
        u.on("logout", () => { this.onLogout() })
        if (u.loggedUser)  this.onLogin()
    }
}
