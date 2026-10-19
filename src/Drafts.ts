
import $ from "jquery"

import NDK, { NDKWiki, NDKDraft, NDKEvent, type NDKFilter, nip19, NDKSubscriptionCacheUsage, type NDKSubscriptionOptions } from "@nostr-dev-kit/ndk";

import { FormattedTime, FormattedBytes, MakeLabelActive, GuiCreateLabeledCacheUsageSelect } from "./various.js";

import { Module } from "@/Module.js"
import { App } from "@/App.js"

import DraftsMainHTML from "@/Drafts.html?raw"
import DraftItemHTMK from "@/DraftItem.html?raw"

import "@/Drafts.scss"

export class Drafts extends Module {
    readonly RELAYS_TAG_SETTING = "relays_tag"
    readonly CACHE_USAGE_SETTING = "cache_usage"

    relaysTag: string = ""
    cacheUsage: NDKSubscriptionCacheUsage = NDKSubscriptionCacheUsage.PARALLEL

    saveSettings() {
        this.settings(this.RELAYS_TAG_SETTING, this.relaysTag)
        this.settings(this.CACHE_USAGE_SETTING, this.cacheUsage)
    }

    loadSettings() {
        const rt = this.settings(this.RELAYS_TAG_SETTING)
        if (rt)  this.relaysTag = rt
        const cu = this.settings(this.CACHE_USAGE_SETTING)
        if (cu)  this.cacheUsage = cu
    }

    onEvent(event: NDKEvent) {
        if (!this.isCurrent())  return
        if (event.kind != NDKDraft.kind) {
            console.warn("Got event not being a draft!")
            return
        }
        const context = this.context
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
        const del = item.find(".Delete")
        if (!draft.content) {
            item.addClass("EmptyDraft")
            empty.hide()
        }
        else del.hide()
        empty.click(() => {
            this.remove(draft)
        })
        del.click(async () => {
            await draft.delete()
            if (!this.sameContext(context))  return
            this.navigate()
        })

        const c = $("#DraftsList")
        c.append(item)

        const dn = $("#DraftsNumber")
        dn.text(c.children().length)
    }

    guiCreateMain() {
        const gui = $(DraftsMainHTML)
        const hideEmpty = gui.find("label[for='HideEmpty']")
        MakeLabelActive(hideEmpty)
        const hideEmptyI = hideEmpty.find("input")
        hideEmptyI.change(() => {
            const empty = gui.find(".EmptyDraft")
            if (hideEmptyI.prop("checked"))
                empty.hide()
            else empty.show()
        })

        this.mainView(gui)
        $("#DraftsRelaysTagSelectPlaceholder").replaceWith(
            App.get().relays.guiCreateTagLabeledSelect(
                (val: string) => { this.relaysTag = val; this.saveSettings() }, this.relaysTag
            ))
        $("#DraftsCacheUsageSelectPlaceholder").replaceWith(
            GuiCreateLabeledCacheUsageSelect(
                (val: string) => { this.cacheUsage = val; this.saveSettings() }, this.cacheUsage
            ))
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
        const op: NDKSubscriptionOptions = {
            closeOnEose : true,
            onEvent: (event) => { this.onEvent(event) } }
        if (this.relaysTag) {
            const urls = App.get().relays.getRelaysByTag(this.relaysTag)
            op.relayUrls = urls
            op.exclusiveRelay = true
        }
        op.cacheUsage = this.cacheUsage
        this.ndk.subscribe(filter, op)
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
            $("#DraftsLink").addClass("Current")
            this.clearUI()
            this.guiCreateMain()
            this.load()
        })
        this.makeLinkActive($("#DraftsLink"), "/")
        const u = App.get().user
        u.on("login", () => { this.onLogin() })
        u.on("logout", () => { this.onLogout() })
        if (u.loggedUser)  this.onLogin()
        this.loadSettings()
    }
}
