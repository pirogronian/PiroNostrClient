
import $ from "jquery"
import type { JQuery } from "jquery"
import NDK, { NDKRelay, NDKRelayStatus, NDKPool, NDKRelayAuthPolicies } from "@nostr-dev-kit/ndk";
import type { NDKRelayInformation } from "@nostr-dev-kit/ndk"
import { safeAsync, InstallRelayDebugHandlers, MakeLabelActive, FormattedBytes, FormattedTime } from "@/various.js"
import { Module } from "@/Module.js";
import { App } from "@/App.js"

import "@/Relays.scss"

import RelaysHTML from "@/Relays.html?raw"
import RelayHeadHTML from "@/RelayHead.html?raw"
import RelayInfoHTML from "@/RelayInfo.html?raw"

const STORAGE_KEY = 'known';

const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://purplepag.es'
];

interface RelaySettingsIface {
    use: boolean
    trusted: boolean
    auth: string
}

class RelaySettings {
    constructor(
        public use: boolean = false,
        public trusted: boolean = false,
        public auth: string = "none"
    ) {}

    toJSON(): RelaySettingsIface {
        return {
            use: this.use,
            trusted: this.trusted,
            auth: this.auth
        }
    }

    static fromJSON(json: RelaySettingsIface): RelaySettings {
        return new RelaySettings(json.use, json.trusted, json.auth)
    }
}

type RelaySettingsDB = Record<string, RelaySettings>;

const AuthPolicies = {
    none: null,
    disconnect: NDKRelayAuthPolicies.disconnect,
    signin: NDKRelayAuthPolicies.signIn
}

export class Relays extends Module {
    autoUse: boolean = false
    autoConnect: boolean = false

    known: RelaySettingsDB = {}

    infos: { [url: string]: NDKRelayInformation } = {}

    challenges: { [url: string] : string } = {}
    notices: { [url: string] : string } = {}

    connectedNum: number = 0
    poolEvent: boolean = true

    relays: { [url: string]: NDKRelay } = {}

    saveSettings() {
        this.settings("autoUse", this.autoUse ? "1" : null)
        this.settings("autoConnect", this.autoConnect ? "1" : null)
    }

    loadSettins() {
        //console.log("Relays::loadSettings()")
        this.autoUse = this.settings("autoUse") ? true : false
        this.autoConnect = this.settings("autoConnect") ? true : false
        this.loadKnown()
        //console.log("AutoConnect:", this.autoConnect)
    }

    get(url: string) {
        return this.relays[url]
    }

    exists(url: string) {
        return url in this.relays
    }

    create(url: string) {
        const relay = new NDKRelay(url, undefined, this.ndk)
        const settings = this.relaySettings(url)
        relay.trusted = settings.trusted
        relay.authPolicy = AuthPolicies[settings.auth]
        this.relays[url] = relay
        InstallRelayDebugHandlers(relay)
        return relay
    }

    createUnique(url: string) {
        let ret = this.get(url)
        if (ret) {
            console.warn("Try create already avaliable relay", url)
            return ret
        }
        return this.create(url)
    }

    destroy(url: string) {
        delete this.relays[url]
    }

    getPooled(url: string) {
        if (url in this.ndk.pool.relays)
            return this.ndk.pool.getRelay(url)
    }

    getPooledRelays() {
        return this.ndk.pool.relays.values();
    }

    getPooledUrls() {
        return this.ndk.pool.relays.keys();
    }

    inPool(url:string) {
        return this.ndk.pool.relays.has(url)
    }

    saveKnown(): void {
        this.settings(STORAGE_KEY, JSON.stringify(this.known));
    }

    loadKnown() {
        const saved = this.settings(STORAGE_KEY);
        if (!saved) return {}

        try {
            const raw: Record<string, RelaySettingsIface> = JSON.parse(saved);
            if (!raw)  return
            const ret : RelaySettingsDB = {}
            for (const [url, value] of Object.entries(raw)) {
                ret[url] = RelaySettings.fromJSON(value)
            }
            this.known = ret;
        } catch (err) {
            console.error("Unable to load known relays:", err)
        }
    }

    load(): void {
        //console.log("Relays::load()")
        //console.log(this.known)
        for(const [url, info] of Object.entries(this.known)) {
            if (info.use)
                this.add(url, this.autoConnect)
        }
    }

    reload() {
        this.poolEvent = false
        this.ndk.pool.relays.clear()
        this.known = {}
        this.challenges = {}
        this.notices = {}
        this.loadSettins()
        this.load()
        this.poolEvent = true
    }

    disconnectAll() {
        this.ndk.pool.relays.forEach((relay, url) => {
            relay.disconnect()
        })
    }

    add(url: string|NDKRelay, connect: boolean = false) {
        let relay: NDKRelay
        if (typeof url == "string") {
            //console.log("Creating relay", url)
            relay = this.create(url)
        }
        else
            relay = url

        if (relay)
            this.ndk.pool.addRelay(relay, connect)
        else
            console.log("No relay created.")
    }

    addDefaults() {
        DEFAULT_RELAYS.forEach((url) => {
            this.add(url)
        })
    }

    remove(url: string): boolean {
        const relay = this.ndk.pool.relays.get(url)
        if (!relay)  return false
        relay.disconnect()
        this.ndk.pool.removeRelay(url)
        return true
    }

    removeAll(): void {
        this.poolEvent = false
        this.ndk.pool.relays.forEach((relay, url) => {
            this.remove(url)
        })
        this.poolEvent = true
    }

    makeKnown(relay: string|NDKRelay): void {
        if (typeof relay != "string") {
            relay = relay.url
        }
        if (!this.known[relay])
            this.known[relay] = new RelaySettings()
    }

    relaySettings(relay: string|NDKRelay): RelaySettings {
        if (typeof relay != "string") {
            relay = relay.url
        }
        if (!this.known[relay])
            this.known[relay] = new RelaySettings()
        return this.known[relay]
    }

    async relayInfo(relay: string|NDKRelay, force: boolean = false): Promise<NDKRelayInformation|undefined> {
        let url = ""
        let info: NDKRelayInformation|undefined = undefined
        if (typeof relay == "string")
            url = relay
        else
            url = relay.url
        //console.log("relayInfo for", url)
        info = this.infos[url]
        if (!info) {
            if (typeof relay != "string") {
                //console.log(url, "- passed NDKRelay")
                try {
                    info = await relay.fetchInfo(force)
                } catch (err) {
                    console.warn(`Downloading of NIP-11 through HTTP failed for ${url}`, err);
                    return
                }
                if (info)
                    this.infos[url] = info
                return info
            } else {
                let relay = this.getPooled(url)
                if (relay) {
                    //console.log(url, "- got NDKRelay")
                    try {
                        info = await relay.fetchInfo(force)
                    } catch (err) {
                        console.warn(`Downloading of NIP-11 through HTTP failed for ${url}`, err);
                        return
                    }
                    if (info)
                        this.infos[url] = info
                    return info
                }

                relay = new NDKRelay(url, undefined, this.ndk)
                if (!relay)  return
                relay.trusted = this.relaySettings(url).trusted
                relay.authPolicy = AuthPolicies[this.relaySettings(url).auth]
                try {
                    info = await relay.fetchInfo(force)
                } catch (err) {
                    console.warn(`Downloading of NIP-11 through HTTP failed for ${url}`, err);
                    return
                }
                if (info)
                    this.infos[url] = info
                return info
            }
        }
        //console.debug("Cached info for", url)
        return info
    }

    makeKnownAll() {
        const list = this.getPooledUrls()
        list.forEach((url) => {
            this.makeKnown(url)
        })
    }

    markUsed(url: string, use: boolean = true) {
        //console.debug("Set bootstrap", use, "for", url)
        if (!this.known[url])
            this.known[url] = new RelaySettings()
        this.known[url].use = use
    }

    markUsedAll(use: boolean = true) {
        for(const [url, info] of Object.entries(this.known)) {
            this.markUsed(url, use)
        }
    }

    onConnectedUpdate() {
        if (this.connectedNum <= 0)
            Module.offline = true
        else
            Module.offline = false
    }

    onUpdate() {
        const stats = this.ndk.pool.stats()
        if (stats.connected > 0) {
            if (Module.offline) {
                Module.offline = false
                this.emit("online")
            }
        }
        else
        {
            if (!Module.offline) {
                Module.offline = true
                this.emit("offline")
            }
        }
        this.connectedNum = stats.connected
        this.guiUpdateStats()
    }

    guiCreateInfo(info: NDKRelayInformation) {
        const rin = $(RelayInfoHTML)

        function fill(selector: string, value: any, parent: JQuery<HTMLElement> = rin): JQuery<HTMLElement> {
            const knode = parent.find("dt".concat(selector))
            const vnode = parent.find("dd".concat(selector))

            if (value) {
                let url
                if (typeof value == "string") {
                    try {
                        url = new URL(value)
                        if (url.protocol == "git+https:") {
                            const newUrl = url.href.replace(/^git\+http/, "http")
                            //console.log("New url:", newUrl)
                            url = new URL(newUrl)
                        }
                    } catch {}
                }
                if (url) {
                    const link = $("<a>")
                    link.text(value)
                    link.prop("href", url.href)
                    vnode.append(link)        
                } else
                    vnode.text(value)
                
            }
            else {
                knode.remove()
                vnode.remove()
            }

            return vnode
        }

        function fillImg(selector: string, value: string|undefined, parent: JQuery<HTMLElement> = rin): JQuery<HTMLElement> {
            const knode = parent.find("dt".concat(selector))
            const vnode = parent.find("dd".concat(selector))
            const img = vnode.find("img")
            if (value) {
                img.prop("src", value)
            }
            else {
                knode.remove()
                vnode.remove()
            }

            return img
        }

        fill(".RelayInfoName", info.name)
        fill(".RelayInfoDescription", info.description)
        fillImg(".RelayInfoBanner", info.banner).click(() => {
            navigator.clipboard.writeText(info.banner ? info.banner : "")
        })
        fillImg(".RelayInfoIcon", info.icon).click(() => {
            navigator.clipboard.writeText(info.icon ? info.icon : "")
        })
        rin.find("dd.RelayInfoPubkey").text(info.pubkey).click(() => {
            navigator.clipboard.writeText(info.pubkey ? info.pubkey : "")
        })
        fill(".RelayInfoContact", info.contact)
        fill(".RelayInfoNIPs", info.supported_nips)
        fill(".RelayInfoSoftware", info.software)
        fill(".RelayInfoVersion", info.version)
        fill(".RelayInfoPrivacy", info.privacy_policy)
        fill(".RelayInfoService", info.terms_of_service)

        const limits = info.limitation
        const rln = rin.find(".RelayLimitations")
        const rldln = rln.find("dl.Info")
        if (limits) {
            fill(".MaxMessageLength", FormattedBytes(limits.max_message_length), rldln)
            fill(".MaxSubscriptions", limits.max_subscriptions, rldln)
            fill(".MaxSubidLength", FormattedBytes(limits.max_subid_length), rldln)
            fill(".MaxLimit", limits.max_limit, rldln)
            fill(".MaxEventTags", limits.max_event_tags, rldln)
            fill(".MaxContentLength", FormattedBytes(limits.max_content_length), rldln)
            fill(".MinPOWDifficulty", limits.min_pow_difficulty, rldln)
            fill(".AuthRequired", limits.auth_required, rldln)
            fill(".PaymentRequired", limits.payment_required, rldln)
            fill(".RestrictedWrites", limits.restricted_writes, rldln)
            fill(".CreatedLowerLimit", FormattedTime(limits.created_at_lower_limit), rldln)
            fill(".CreatedUpperLimit", FormattedTime(limits.created_at_upper_limit), rldln)
            fill(".DefaultLimit", limits.default_limit, rldln)
        } else rln.remove()

        fill(".RelayCountries", info.relay_countries)
        fill(".LanguageTags", info.language_tags)
        fill(".Tags", info.tags)
        fill(".PostingPolicy", info.posting_policy)
        fill(".PaymentsUrl", info.payments_url)

        const rfn = rin.find(".RelayFees")
        const fees = info.fees
        let keep = false
        if (fees) {
            const adms = fees.admission
            if (adms && adms.length > 0) {
                keep = true
                rfn.append($("<h2>").text("Admission:"))
                
                adms?.forEach((adm) => {
                    const div = $("<div>")
                    div.addClass("Info")
                    div.append($("<dt>").text("Amount:"))
                    div.append($("<dd>").text(adm.amount))
                    div.append($("<dt>").text("Unit:"))
                    div.append($("<dd>").text(adm.unit))
                    rfn.append(div)
                })
            }
            
            const subs = fees.subscription
            if (subs && subs.length > 0) {
                keep = true
                rfn.append($("<h2>").text("Subscription:"))
                
                subs.forEach((sub) => {
                    const div = $("<div>")
                    div.addClass("Info")
                    div.append($("<dt>").text("Amount:"))
                    div.append($("<dd>").text(sub.amount))
                    div.append($("<dt>").text("Unit:"))
                    div.append($("<dd>").text(sub.unit))
                    div.append($("<dt>").text("Period:"))
                    div.append($("<dd>").text(sub.period))
                    rfn.append(div)
                })
            }

            const pubs = fees.publication
            if (pubs && pubs.length > 0) {
                keep = true
                rfn.append($("<h2>").text("Publication:"))
                
                pubs.forEach((pub) => {
                    const div = $("<div>")
                    div.addClass("Info")
                    div.append($("<dt>").text("Kinds:"))
                    div.append($("<dd>").text(pub.kinds))
                    div.append($("<dt>").text("Amount:"))
                    div.append($("<dd>").text(pub.amount))
                    div.append($("<dt>").text("Unit:"))
                    div.append($("<dd>").text(pub.unit))
                    rfn.append(div)
                })
            }

            if (!keep)  rfn.parent().parent().remove()
        } else rin.find(".RelayPayments").remove()

        return rin
    }

    guiCreateItem(relay: NDKRelay|string, url: string|undefined = undefined) {
        url = url? url : typeof relay == "string" ? relay : relay.url

        const rn = $(RelayHeadHTML)
        rn.attr("relay", url)
        rn.find("a").text(url).attr("href", url)

        const p = this.relayInfo(relay)
        p.then((info) => {
            if (!info) {
                console.debug("No info for", url)
                return
            }
            const i = this.guiCreateInfo(info)
            if (!i.length) {
                console.warn("Found info but widget is absent for", url)
            }
            //console.debug(i)
            rn.append(i)
            i.hide()
            rn.find(".RelayInfoButton").prop("disabled", false).click(() => {
                //console.debug("Toggle info of", url)
                //console.debug(i)
                i.toggle()
            })
        })
        MakeLabelActive(rn.find("label.RelayRead"))
        MakeLabelActive(rn.find("label.RelayWrite"))

        const bn = rn.find("input.RelayBootstrap")
        bn.change(() => {
            this.markUsed(url, bn.prop("checked"))
            this.saveKnown()
            this.guiRefreshItem(url)
        })

        const rrn = rn.find("input.RelayRead")
        rrn.change(() => {
            const User = App.get().user
            const add = rrn.prop("checked")
            if (add)  User.addReadRelay(url)
            else  User.removeReadRelay(url)
        })
        const wrn = rn.find("input.RelayWrite")
        wrn.change(() => {
            //console.debug("Clicked write checkbox.")
            const User = App.get().user
            const add = wrn.prop("checked")
            if (add)  User.addWriteRelay(url)
            else  User.removeWriteRelay(url)
        })

        const tn = rn.find("input.RelayTrusted")
        tn.prop("checked", this.relaySettings(relay)?.trusted)
        tn.change(() => {
            const trusted = tn.prop("checked")
            this.relaySettings(relay).trusted = trusted
            if (typeof relay == "object")
                relay.trusted = trusted
            this.saveKnown()
        })
        const an = rn.find("select.RelayAuth")
        an.prop("value", this.relaySettings(relay)?.auth)
        an.change(() => {
            const as = an.prop("value")
            this.relaySettings(relay).auth = as
            if (typeof relay == "object") {
                relay.authPolicy = AuthPolicies[as]
                relay.disconnect()
                relay.connect()
            }
            this.saveKnown()
        })
        const sn = rn.find(".RelayHeadMore")
        const rsb = rn.find(".RelaySettingsButton")
        rsb.click(() => { sn.toggle() })
        sn.hide()

        rn.find(".ConnectRelayButton").click(() => {
            const relay = this.get(url)
            if (relay)  relay.connect()
        })
        rn.find(".DisconnectRelayButton").click(() => {
            const relay = this.get(url)
            if (relay)  relay.disconnect()
        })

        rn.find("button.AddRelayButton").click(() => {
            this.add(url, this.autoConnect)
        })
        rn.find("button.RemoveRelayButton").click(() => {
            console.log("Removing:", url)
            this.remove(url)
            this.markUsed(url, false)
            this.saveKnown()
        })

        rn.find("button.ForgetRelayButton").click(() => {
            delete this.known[url]
            this.saveKnown()
            this.guiReloadItems()
        })

        return rn
    }

    guiRefreshItem(relay: NDKRelay|string|undefined) {
        if (relay == undefined)  return
        const url = typeof relay == "string" ? relay : relay.url
        //console.log("Refreshing", url)
        if (typeof relay == "string")
            relay = this.relays[url]
        if (!relay)  relay = url
        const ri = $(`div[relay='${url}']`)

        const cn = ri.find(".Challenge")
        cn.hide()
        const nn = ri.find(".Notice")
        if (this.notices[url])
            nn.text(this.notices[url]).show()
        else
            nn.hide()

        const crb = ri.find(".ConnectRelayButton")
        const drb = ri.find(".DisconnectRelayButton")
        if (typeof relay != "string") {
            if (relay.status == NDKRelayStatus.AUTH_REQUESTED) {
                if (this.challenges[url])
                    cn.text(this.challenges[url]).show()
            }
            let c: string = NDKRelayStatus[relay.status]
            c = c.toLocaleLowerCase()
            //console.debug("Refresh item for", relay.url, c)
            const s = ri.find(".RelayStatus")
            s.text(c)
            s.removeClass()
            s.addClass("RelayStatus")
            s.addClass(c)

            if (relay.connected) {
                crb.hide()
                drb.show()
            } else {
                crb.show()
                drb.hide()
            }
        } else {
            crb.hide()
            drb.hide()
        }

        const n = ri.find(".New")
        if (!this.known[url])
            n.show()
        else
            n.hide()

        const urb = ri.find(".UseRelayButton")
        const durb = ri.find(".DontUseRelayButton")
        if (this.known[url]?.use) {
            urb.hide()
            durb.show()
        }
        else {
            urb.show()
            durb.hide()
        }

        const arb = ri.find(".AddRelayButton")
        const rrb = ri.find(".RemoveRelayButton")
        const frb = ri.find(".ForgetRelayButton")
        if (this.inPool(url)) {
            rrb.show()
            arb.hide()
            frb.hide()
        } else {
            rrb.hide()
            arb.show()
            frb.show()
        }

        const User = App.get().user
        const rrn = ri.find("label.RelayRead")
        const wrn = ri.find("label.RelayWrite")
        if (User.loggedRelays) {
            rrn.show()
            wrn.show()
            rrn.find("input").prop("checked", User.isReadRelay(url))
            wrn.find("input").prop("checked", User.isWriteRelay(url))
        } else {
            rrn.hide()
            wrn.hide()
        }

        const bn = ri.find("input.RelayBootstrap")
        bn.prop("checked", this.relaySettings(url).use)
    }

    guiCreateMain() {
        const rmw = $(RelaysHTML)
        this.mainView().append(rmw)
        const Head = rmw.find("#RelaysHeader")
        const arl = rmw.find("#ActiveRelays")
        const orl = rmw.find("#OtherRelays")

        const NewUrl = $("input[name='NewRelayUrl']")
        Head.find("#AddRelayButton").click(() => {
            this.add(NewUrl.val(), this.autoConnect)
            this.saveKnown()
        })
        const aac = Head.find("input[name='AutoAddRelay']")
        if (this.autoUse)
            aac.prop("checked", true)
        aac.change(() => {
            this.autoUse = aac.prop("checked")
            this.saveSettings()
        })
        MakeLabelActive(aac.parent())
        const acc = Head.find("input[name='AutoConnectRelay']")
        if (this.autoConnect)
            acc.prop("checked", true)
        acc.change(() => {
            this.autoConnect = acc.prop("checked")
            this.saveSettings()
        })
        MakeLabelActive(acc.parent())
        Head.find("#AddDefaultsRelays").click(() => {
            this.poolEvent = false
            DEFAULT_RELAYS.forEach((relay) => {
                this.add(relay)
            })
            this.poolEvent = true
            this.guiReloadItems()
        })
        Head.find("#DisconnectAllRelays").click(() => {
            this.disconnectAll()
        })
        Head.find("#RemoveAllRelays").click(() => {
            this.removeAll()
            this.guiReloadItems()
        })
        /*Head.find("#SaveAllRelays").click(() => {
            this.save()
            this.handle()
        })*/

        Head.find("#RefreshRelaysItems").click(() => {
            this.guiRefreshItems()
        })
        Head.find("#ReloadRelaysItems").click(() => {
            this.guiReloadItems()
        })
        Head.find("#ReloadRelays").click(() => {
            this.reload()
            this.guiReloadItems()
        })

        App.get().user.guiPublishRelaysButtonSetup()

        return [Head, arl, orl]
    }

    guiActiveContainer() {
        return $("#ActiveRelays")
    }

    guiOtherContainer() {
        return $("#OtherRelays")
    }

    guiUpdateStats() {
        const inPool = this.ndk.pool.relays.size
        const statStr = `Active relays: ${this.connectedNum} connected / ${inPool}`
        $("#ActiveRelaysStats").text(statStr)
        const outsidePool = Object.entries(this.known).length - inPool
        const otherStr = `Other relays: ${outsidePool}`
        $("#OtherRelaysStats").text(otherStr)
    }

    guiPopulateActive() {
        const context = this.context
        const used = this.getPooledRelays()
        const list = this.guiActiveContainer()
        for (const relay of used) {
            const item = this.guiCreateItem(relay)
            if (!this.sameContext(context))  return
            list.append(item)
            this.guiRefreshItem(relay)
        }
    }

    guiPopulateOther() {
        const context = this.context
        const list = this.guiOtherContainer()
        //console.debug("Existing relay objects:", this.relays, "End of relays.")
        for(const [url, info] of Object.entries(this.known)) {
            if (!this.inPool(url)) {
                let relay: NDKRelay|string|undefined = this.relays[url]
                if (!relay)  relay = url
                //console.log("Creating item for unused", url)
                const item = this.guiCreateItem(relay, url)
                if (!this.sameContext(context))  return
                list.append(item)
                this.guiRefreshItem(url)
            }
        }
    }

    guiRefreshItems() {
        console.debug("Refreshing all items...")
        for (const [url, setting] of Object.entries(this.known)) {
            this.guiRefreshItem(url)
        }
    }

    guiReloadItems() {
        this.guiActiveContainer().empty()
        this.guiOtherContainer().empty()
        this.guiPopulateActive()
        this.guiPopulateOther()
    }

    show() {
        this.newContext()
        
        this.guiCreateMain()
        this.guiPopulateActive()
        this.guiPopulateOther()
    }

    handle() {
        //console.log("Relays::handle()")
        if (!this.isCurrent())  return
        $("#RelaysLink").addClass("Current")
        this.clearUI()
        this.loadSettins()
        this.show()
        this.guiUpdateStats()
        //console.log("End Relays::handle()")
    }

    setup() {
        this.onRoute("", () => {
            this.setCurrent()
            this.handle()
        })
        this.makeLinkActive($("#RelaysLink"), "")

        const originalAdd = this.ndk.pool.addRelay.bind(this.ndk.pool);
        const originalRemove = this.ndk.pool.removeRelay.bind(this.ndk.pool);

        const poolEvent = this.poolEvent
        // Nadpisujemy addRelay
        this.ndk.pool.addRelay = function(relay: NDKRelay, connect?: boolean) {
            //console.log("addRelay:", relay.url, connect)
            const result = originalAdd(relay, connect);
            if (poolEvent)
                this.emit('added', relay);
            return result;
        };

        // Nadpisujemy removeRelay
        this.ndk.pool.removeRelay = function(relayUrl: string) {
            const result = originalRemove(relayUrl);
            if (poolEvent)
                this.emit('removed', { relayUrl });
            return result;
        };


        this.ndk.pool.on('relay:connect', (relay) => {
            //console.debug("On realy:connect:", relay.url)
            delete this.challenges[relay.url]
            this.onUpdate()
            if (this.autoUse) {
                this.markUsed(relay.url)
            } else
                this.makeKnown(relay)
            this.saveKnown();
            this.guiRefreshItem(relay)
        });
        this.ndk.pool.on("relay:disconnect", (relay) => {
            //this.onDecreaseConnected()
            this.onUpdate()
            this.guiRefreshItem(relay)
        })
        this.ndk.pool.on("relay:connecting", (relay) => {
            this.onUpdate()
            this.guiRefreshItem(relay)
        })
        this.ndk.pool.on("relay:auth", (relay: NDKRelay, challenge: string) => {
            //this.onDecreaseConnected()
            this.onUpdate()
            this.challenges[relay.url] = challenge
            this.guiRefreshItem(relay)
        })
        this.ndk.pool.on("relay:authed", (relay) => {
            //this.onIncreaseConnected()
            this.onUpdate()
            this.guiRefreshItem(relay)
        })
        this.ndk.pool.on("relay:ready", (relay) => {
            this.onUpdate()
            this.guiRefreshItem(relay)
        })
        this.ndk.pool.on("notice", (relay: NDKRelay, notice: string) => {
            this.onUpdate()
            this.notices[relay.url] = notice
            this.guiRefreshItem(relay)
        })
        this.ndk.pool.on("flapping", (relay) => {
            this.onUpdate()
            this.guiRefreshItem(relay)
        })
        this.ndk.pool.on("added", (relay) => {
            this.onUpdate()
            //console.log("Added relay:", relay.url)
            if (this.autoConnect) {
                //console.log("Autoconnecting...")
                relay.connect()
            }
            this.makeKnownAll()
            //this.saveKnown()
            this.guiReloadItems()
        })
        this.ndk.pool.on("removed", (relay) => {
            this.onUpdate()
            //this.saveKnown()
            this.guiReloadItems()
        })

        //console.debug("Event handler are set.")

        this.loadSettins()
        this.load()
        this.onConnectedUpdate()
    }
}

