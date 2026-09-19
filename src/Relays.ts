
import $ from "jquery"
import type { JQuery } from "jquery"
import NDK, { NDKRelay, NDKRelayStatus, NDKPool, NDKRelayAuthPolicies } from "@nostr-dev-kit/ndk";
import type { NDKRelayInformation } from "@nostr-dev-kit/ndk"
import { safeAsync, InstallRelayDebugHandlers } from "@/various.js"
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
        //InstallRelayDebugHandlers(relay)
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
        if (stats.connected > 0)
            Module.offline = false
        else
            Module.offline = true
        this.connectedNum = stats.connected
        this.guiUpdateStats()
    }

    guiCreateInfo(info: NDKRelayInformation) {
        const rin = $(RelayInfoHTML)
        rin.find(".RelayInfoName").text(info?.name)
        rin.find(".RelayInfoDescription").text(info?.description)
        rin.find(".RelayInfoBanner img").prop("src", info?.banner).click(() => {
            navigator.clipboard.writeText(info?.banner ? info.banner : "")
        })
        rin.find(".RelayInfoIcon img").prop("src", info?.icon).click(() => {
            navigator.clipboard.writeText(info?.icon ? info.icon : "")
        })
        rin.find(".RelayInfoPubkey").text(info?.pubkey).click(() => {
            navigator.clipboard.writeText(info?.pubkey ? info.pubkey : "")
        })
        rin.find(".RelayInfoContact").text(info?.contact)
        rin.find(".RelayInfoNIPs").text(info?.supported_nips)
        rin.find(".RelayInfoSoftware").text(info?.software)
        rin.find(".RelayInfoVersion").text(info?.version)
        rin.find(".RelayInfoPrivacy").text(info?.privacy_policy)
        rin.find(".RelayInfoService").text(info?.terms_of_service)

        return rin
    }

    guiCreateItem(relay: NDKRelay|string, url: string|undefined = undefined) {
        //const context = this.context
        url = url? url : typeof relay == "string" ? relay : relay.url

        const rn = $(RelayHeadHTML)
        rn.attr("relay", url)
        rn.find("a").text(url).attr("href", url)

        const cn = rn.find(".Challenge")
        if (this.challenges[url])
            cn.text(this.challenges[url]).show()
        else
            cn.hide()
        const nn = rn.find(".Notice")
        if (this.notices[url])
            nn.text(this.notices[url]).show()
        else
            nn.hide()

        const p = this.relayInfo(relay)
        p.then((info) => {
            //if (!this.sameContext(context))  return
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

        rn.find(".UseRelayButton").click(() => {
            this.markUsed(url)
            this.saveKnown()
            this.guiRefreshItem(url)
        })
        rn.find(".DontUseRelayButton").click(() => {
            this.markUsed(url, false)
            this.saveKnown()
            this.guiRefreshItem(url)
        })

        if (typeof relay == "string") {
            const s = rn.find(".RelayStatus")
                s.text("unused")
                s.addClass("unused")

                rn.find(".ConnectRelayButton").hide()
                rn.find(".DisconnectRelayButton").hide()
        } else {
            let c: string = NDKRelayStatus[relay.status]
            c = c.toLocaleLowerCase()
            const s = rn.find(".RelayStatus")
            s.text(c)
            s.addClass(c)
            if (!this.known[url]) {
                rn.find(".New").show()
            }
        }

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
            //this.handle()
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
        console.log("Refreshing", url)
        if (typeof relay == "string")
            relay = this.relays[url]
        if (!relay)  relay = url
        const ri = $(`div[relay='${url}']`)

        const crb = ri.find(".ConnectRelayButton")
        const drb = ri.find(".DisconnectRelayButton")
        if (typeof relay != "string") {
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
        const acc = Head.find("input[name='AutoConnectRelay']")
        if (this.autoConnect)
            acc.prop("checked", true)
        acc.change(() => {
            this.autoConnect = acc.prop("checked")
            this.saveSettings()
        })
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

        Head.find("RefreshRelayItems").click(() => {
            this.guiRefreshItems()
        })
        Head.find("#ReloadRelaysItems").click(() => {
            this.guiReloadItems()
        })
        Head.find("#ReloadRelays").click(() => {
            this.reload()
            this.guiReloadItems()
        })

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
        const statStr = `Connected: ${this.connectedNum}/${inPool}`
        $("#RelaysStats").text(statStr)
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

