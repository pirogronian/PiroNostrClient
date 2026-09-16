
import $ from "jquery"
import type { JQuery } from "jquery"
import NDK, { NDKRelay, NDKRelayStatus, NDKPool, NDKRelayAuthPolicies } from "@nostr-dev-kit/ndk";
import type { NDKRelayInformation } from "@nostr-dev-kit/ndk"
import { safeAsync } from "@/various.js"
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

    saveSettings() {
        this.settings("autoUse", this.autoUse ? "1" : null)
        this.settings("autoConnect", this.autoConnect ? "1" : null)
    }

    loadSettins() {
        //console.log("Relays::loadSettings()")
        this.autoUse = this.settings("autoUse") ? true : false
        this.autoConnect = this.settings("autoConnect") ? true : false
        //console.log("AutoConnect:", this.autoConnect)
    }

    get(url: string) {
        if (url in this.ndk.pool.relays)
            return this.ndk.pool.getRelay(url)
    }

    getRelays() {
        return this.ndk.pool.relays.values();
    }

    getUrls() {
        return this.ndk.pool.relays.keys();
    }

    save(): void {
        this.settings(STORAGE_KEY, JSON.stringify(this.known));
    }

    getStored(): RelaySettingsDB {
        const saved = this.settings(STORAGE_KEY);
        if (!saved) return {}

        try {
            const raw: Record<string, RelaySettingsIface> = JSON.parse(saved);
            if (!raw)  return {}
            const ret : RelaySettingsDB = {}
            for (const [url, value] of Object.entries(raw)) {
                ret[url] = RelaySettings.fromJSON(value)
            }
            return ret;
        } catch {
            return {};
        }
    }

    load(): void {
        //console.log("Relays::load()")
        this.known = this.getStored()
        //console.log(this.known)
        for(const [url, info] of Object.entries(this.known)) {
            if (info.use)
                this.add(url, this.autoConnect)
        }
    }

    reload() {
        this.ndk.pool.relays.clear()
        this.known = {}
        this.challenges = {}
        this.notices = {}
        this.loadSettins()
        this.load()
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
            relay = new NDKRelay(url, undefined, this.ndk)
            relay.trusted = this.relaySettings(relay).trusted
            relay.authPolicy = AuthPolicies[this.relaySettings(relay).auth]
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
        this.ndk.pool.relays.forEach((relay, url) => {
            this.remove(url)
        })
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
        let info: NDKRelayInformation|undefined
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
                let relay = this.get(url)
                if (relay) {
                    //console.log(url, "- got NDKRelay")
                    info = await relay.fetchInfo(force)
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
        return info
    }

    makeKnownAll() {
        const list = this.getUrls()
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

    onIncreaseConnected() {
        this.connectedNum += 1
        if (this.connectedNum > 0)
            Module.offline = false
    }

    onDecreaseConnected() {
        this.connectedNum -= 1
        if (this.connectedNum <= 0)
            Module.offline = true
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

    async guiRelayInfo(relay: NDKRelay|string, node: JQuery<HTMLElement>): JQuery<HTMLElement> {
        const context = this.context
        const url = typeof relay == "string" ? relay : relay.url
        const info = await this.relayInfo(relay, true)
        if (!this.sameContext(context) || !info)  return
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

        node.append(rin)

        return rin
    }

    async guiCreateItem(relay: NDKRelay|string) {
        const context = this.context
        const url = typeof relay == "string" ? relay : relay.url

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

        const [err, i] = await safeAsync(this.guiRelayInfo(relay, rn))
        if (!this.sameContext(context))  return
        //console.log("Check info for", url)
        if (i) {
            i.hide()
            rn.find(".RelayInfoButton").click(() => {
                i.toggle()
            })
        }

        const tn = rn.find("input.RelayTrusted")
        tn.prop("checked", this.relaySettings(relay)?.trusted)
        tn.change(() => {
            const trusted = tn.prop("checked")
            this.relaySettings(relay).trusted = trusted
            if (typeof relay == "object")
                relay.trusted = trusted
            this.save()
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
            this.save()
        })

        if (typeof relay == "string") {
            const s = rn.find(".RelayStatus")
                s.text("unused")
                s.addClass("unused")

                rn.find(".ConnectRelayButton").hide()
                rn.find(".DisconnectRelayButton").hide()
                rn.find(".UseRelayButton").hide()
                rn.find(".DontUseRelayButton").hide()
                rn.find("button.AddRelayButton").click(() => {
                    this.add(url, this.autoConnect)
                    //this.handle()
                })
                rn.find(".RemoveRelayButton").hide()
                rn.find("button.ForgetRelayButton").click(() => {
                    delete this.known[url]
                    this.save()
                    this.handle()
                })
        } else {
            let c: string = NDKRelayStatus[relay.status]
            c = c.toLocaleLowerCase()
            const s = rn.find(".RelayStatus")
            s.text(c)
            s.addClass(c)
            if (!this.known[relay.url]) {
                rn.find(".New").show()
            }

            rn.find(".ConnectRelayButton").click(() => {
                relay.connect()
            })
            rn.find(".DisconnectRelayButton").click(() => {
                relay.disconnect()
            })

            rn.find(".UseRelayButton").click(() => {
                this.markUsed(relay.url)
                this.save()
                this.guiRefreshItem(relay)
            })
            rn.find(".DontUseRelayButton").click(() => {
                this.markUsed(relay.url, false)
                this.save()
                this.guiRefreshItem(relay)
            })

            rn.find("button.RemoveRelayButton").click(() => {
                console.log("Removing:", relay.url)
                this.remove(relay.url)
                this.markUsed(relay.url, false)
                this.save()
                //this.handle()
            })

            rn.find("button.AddRelayButton").hide()
            rn.find("button.ForgetRelayButton").hide()
        }

        return rn
    }

    guiRefreshItem(relay: NDKRelay) {
        //console.log("Refreshing", relay.url)
        const ri = $(`div[relay='${relay.url}']`)
        let c: string = NDKRelayStatus[relay.status]
        c = c.toLocaleLowerCase()
        //console.debug("Refresh item for", relay.url, c)
        const s = ri.find(".RelayStatus")
        s.text(c)
        s.removeClass()
        s.addClass("RelayStatus")
        s.addClass(c)
        const n = ri.find(".New")
        if (!this.known[relay.url])
            n.show()
        else
            n.hide()

        const crb = ri.find(".ConnectRelayButton")
        const drb = ri.find(".DisconnectRelayButton")
        if (relay.connected) {
            crb.hide()
            drb.show()
        } else {
            crb.show()
            drb.hide()
        }

        const urb = ri.find(".UseRelayButton")
        const durb = ri.find(".DontUseRelayButton")
        if (this.known[relay.url]?.use) {
            urb.hide()
            durb.show()
        }
        else {
            urb.show()
            durb.hide()
        }
    }

    guiCreateMain() {
        const rmw = $(RelaysHTML)
        this.mainView().append(rmw)
        const Head = rmw.find("#ActiveRelaysHeader")
        const arl = rmw.find("#ActiveRelays")
        const orl = rmw.find("#OtherRelays")

        const NewUrl = $("input[name='NewRelayUrl']")
        Head.find("#AddRelayButton").click(() => {
            this.add(NewUrl.val(), this.autoConnect)
            this.save()
            this.handle()
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
            DEFAULT_RELAYS.forEach((relay) => {
                this.add(relay)
            })
            this.handle()
        })
        Head.find("#DisconnectAllRelays").click(() => {
            this.disconnectAll()
        })
        Head.find("#RemoveAllRelays").click(() => {
            this.removeAll()
            this.handle()
        })
        /*Head.find("#SaveAllRelays").click(() => {
            this.save()
            this.handle()
        })*/
        Head.find("#RefreshActiveRelays").click(() => {
            this.handle()
        })
        Head.find("#ReloadActiveRelays").click(() => {
            this.reload()
            this.handle()
        })

        return [Head, arl, orl]
    }

    guiUpdateStats() {
        const inPool = this.ndk.pool.relays.size
        const statStr = `Connected: ${this.connectedNum}/${inPool}`
        $("#RelaysStats").text(statStr)
    }

    async show() {
        this.newContext()
        const context = this.context

        const [Header, UIList, ORList] = this.guiCreateMain()

        const used = this.getRelays()
        const stored = this.getStored()

        for (const relay of used) {
            const item = await this.guiCreateItem(relay)
            if (!this.sameContext(context))  return
            UIList.append(item)
            this.guiRefreshItem(relay)
        }

        const urls = Array.from(this.getUrls())
        for(const [url, info] of Object.entries(this.known)) {
            if (!urls.includes(url)) {
                //console.log("Creating item for unused", url)
                const item = await this.guiCreateItem(url)
                if (!this.sameContext(context))  return
                ORList.append(item)
            }
        }
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
        this.onRoute("", (match) => {
            this.setCurrent()
            this.handle()
        })
        this.makeLinkActive($("#RelaysLink"), "")

        const originalAdd = this.ndk.pool.addRelay.bind(this.ndk.pool);
        const originalRemove = this.ndk.pool.removeRelay.bind(this.ndk.pool);

        // Nadpisujemy addRelay
        this.ndk.pool.addRelay = function(relay: NDKRelay, connect?: boolean) {
            //console.log("addRelay:", relay.url, connect)
            const result = originalAdd(relay, connect);
            this.emit('added', relay);
            return result;
        };

        // Nadpisujemy removeRelay
        this.ndk.pool.removeRelay = function(relayUrl: string) {
            const result = originalRemove(relayUrl);
            this.emit('removed', { relayUrl });
            return result;
        };


        this.ndk.pool.on('relay:connect', (relay) => {
            //console.debug("On realy:connect:", relay.url)
            this.onUpdate()
            if (this.autoUse) {
                this.markUsed(relay.url)
            } else
                this.makeKnown(relay)
            this.save();
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
            this.save()
            this.handle()
        })
        this.ndk.pool.on("removed", (relay) => {
            this.onUpdate()
            this.handle()
        })

        //console.debug("Event handler are set.")

        this.loadSettins()
        this.load()
        this.onConnectedUpdate()
    }
}

