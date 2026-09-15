
import $ from "jquery"
import type { JQuery } from "jquery"
import NDK, { NDKRelay, NDKRelayStatus, NDKPool, NDKRelayAuthPolicies } from "@nostr-dev-kit/ndk";
import type { NDKRelayInformation } from "@nostr-dev-kit/ndk"
import { Module } from "@/Module.js";
import { App } from "@/App.js"

import RelaysHTML from "@/Relays.html?raw"
import ActiveRelayHTML from "@/ActiveRelay.html?raw"
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
        info = this.infos[url]
        if (!info) {
            if (typeof relay != "string") {
                info = await relay.fetchInfo(force)
                if (!this.isCurrent())  return
                if (info)
                    this.infos[url] = info
                return info
            } else {
                relay = this.get(url)
                if (!relay) {
                    relay = new NDKRelay(url, undefined, this.ndk)
                    info = await relay.fetchInfo(force)
                    if (!this.isCurrent())  return
                    if (info)
                        this.infos[url] = info
                    return info
                }
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
    }

    async info(relay: NDKRelay|string, node: JQuery<HTMLElement>): JQuery<HTMLElement> {
        const url = typeof relay == "string" ? relay : relay.url
        const info = await this.relayInfo(relay, true)
        if (!this.isCurrent())  return
        const rin = $(RelayInfoHTML)
        rin.find(".RelayInfoName").text(info?.name)
        rin.find(".RelayInfoDescription").text(info?.description)
        rin.find(".RelayInfoBanner").text(info?.banner)
        rin.find(".RelayInfoIcon img").prop("src", info?.icon)
        rin.find(".RelayInfoPubkey").text(info?.pubkey)
        rin.find(".RelayInfoContact").text(info?.contact)
        rin.find(".RelayInfoNIPs").text(info?.supported_nips)
        rin.find(".RelayInfoSoftware").text(info?.software)
        rin.find(".RelayInfoVersion").text(info?.version)
        rin.find(".RelayInfoPrivacy").text(info?.privacy_policy)
        rin.find(".RelayInfoService").text(info?.terms_of_service)

        node.append(rin)

        return rin
    }

    async show() {
        this.mainView().html(RelaysHTML)
        const used = this.getRelays()
        const stored = this.getStored()
        const Head = $("#ActiveRelaysHeader")
        const UIList = $("#ActiveRelays")

        const NewUrl = $("input[name='NewRelayUrl']")
        Head.find("#AddRelayButton").click((e) => {
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
        const inPool = this.ndk.pool.relays.size
        const statStr = `Connected: ${this.connectedNum}/${inPool}`
        $("#RelaysStats").text(statStr)

        UIList.empty()

        used.forEach(async (relay : NDKRelay) => {
            const arn = $(ActiveRelayHTML)
            //console.log("Relay:", relay.url)
            arn.find("a").text(relay.url).attr("href", relay.url)
            let c: string = NDKRelayStatus[relay.status]
            c = c.toLocaleLowerCase()
            const s = arn.find(".RelayStatus")
            s.text(c)
            s.addClass(c)
            if (!this.known[relay.url]) {
                arn.find(".New").show()
            }
            const cn = arn.find(".Challenge")
            if (this.challenges[relay.url])
                cn.text(this.challenges[relay.url]).show()
            else
                cn.hide()
            const nn = arn.find(".Notice")
            if (this.notices[relay.url])
                nn.text(this.notices[relay.url]).show()
            else
                nn.hide()
            const i = await this.info(relay, arn)
            if (!this.isCurrent())  return
            i.hide()
            arn.find(".RelayInfoButton").click(() => {
                i.toggle()
            })
            if (relay.connected)
                arn.find(".ConnectRelayButton").hide()
            else
                arn.find(".DisconnectRelayButton").hide()
                arn.find(".ConnectRelayButton").click(() => {
                relay.connect()
            })
            arn.find(".DisconnectRelayButton").click(() => {
                relay.disconnect()
            })

            if (this.known[relay.url] && this.known[relay.url]?.use)
                arn.find(".UseRelayButton").hide()
            else
                arn.find(".DontUseRelayButton").hide()
            arn.find(".UseRelayButton").click(() => {
                console.log("Use")
                this.markUsed(relay.url)
                this.save()
                this.handle()
            })
            arn.find(".DontUseRelayButton").click(() => {
                console.log("Dont use")
                this.markUsed(relay.url, false)
                this.save()
                this.handle()
            })
            arn.find("button.RemoveRelayButton").click((e) => {
                console.log("Removing:", relay.url)
                this.remove(relay.url)
                this.markUsed(relay.url, false)
                this.save()
                this.handle()
            })
            arn.find("button.AddRelayButton").hide()
            arn.find("button.ForgetRelayButton").hide()

            //arn.find(".RelayTrusted").text(relay.trusted)
            const tn = arn.find("input.RelayTrusted")
            tn.prop("checked", this.relaySettings(relay)?.trusted)
            tn.change(() => {
                const trusted = tn.prop("checked")
                this.relaySettings(relay).trusted = trusted
                relay.trusted = trusted
                this.save()
            })
            const an = arn.find("select.RelayAuth")
            an.prop("value", this.relaySettings(relay)?.auth)
            an.change(() => {
                const as = an.prop("value")
                this.relaySettings(relay).auth = as
                relay.authPolicy = AuthPolicies[as]
                relay.disconnect()
                relay.connect()
                this.save()
            })
            //console.log(relay.authPolicy)

            UIList.append(arn)
        })
        const urls = Array.from(this.getUrls())
        for(const [url, info] of Object.entries(this.known)) {
            if (!urls.includes(url)) {
                const urn = $(ActiveRelayHTML)
                urn.find("a").text(url).attr("href", url)
                const s = urn.find(".RelayStatus")
                s.text("unused")
                s.addClass("unused")
                urn.find(".ConnectRelayButton").hide()
                urn.find(".DisconnectRelayButton").hide()
                urn.find(".UseRelayButton").hide()
                urn.find(".DontUseRelayButton").hide()
                urn.find("button.AddRelayButton").click(() => {
                    this.add(url, this.autoConnect)
                    this.handle()
                })
                urn.find(".Challenge").text(this.challenges[url])
                urn.find(".Notice").text(this.notices[url])
                urn.find(".RemoveRelayButton").hide()
                urn.find("button.ForgetRelayButton").click(() => {
                    delete this.known[url]
                    this.save()
                    this.handle()
                })
                const tn = urn.find("input.RelayTrusted")
                tn.prop("checked", this.relaySettings(url)?.trusted)
                tn.change(() => {
                    const trusted = tn.prop("checked")
                    this.relaySettings(url).trusted = trusted
                    this.save()
                })
                const an = urn.find("select.RelayAuth")
                an.prop("value", this.relaySettings(url)?.auth)
                an.change(() => {
                    const as = an.prop("value")
                    console.log("Set auth policy to", as)
                    this.relaySettings(url).auth = as
                    this.save()
                })

                UIList.append(urn)
            }
        }
    }

    handle() {
        //console.log("Relays::handle()")
        if (!this.isCurrent())  return
        this.clearUI()
        this.loadSettins()
        this.show()
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
            console.log("addRelay:", relay.url, connect)
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
            this.onUpdate()
            //this.onIncreaseConnected()
            if (this.autoUse) {
                this.markUsed(relay.url)
            } else
                this.makeKnown(relay)
            this.save();
            this.handle()
        });
        this.ndk.pool.on("relay:disconnect", () => {
            //this.onDecreaseConnected()
            this.onUpdate()
            this.handle()
        })
        this.ndk.pool.on("relay:auth", (relay: NDKRelay, challenge: string) => {
            //this.onDecreaseConnected()
            this.onUpdate()
            this.challenges[relay.url] = challenge
            this.handle()
        })
        this.ndk.pool.on("relay:authed", () => {
            //this.onIncreaseConnected()
            this.onUpdate()
            this.handle()
        })
        this.ndk.pool.on("notice", (relay: NDKRelay, notice: string) => {
            this.onUpdate()
            this.notices[relay.url] = notice
        })
        this.ndk.pool.on("relay:connecting", () => {
            this.onUpdate()
            this.handle()
        })
        this.ndk.pool.on("flapping", () => {
            this.onUpdate()
            this.handle()
        })
        this.ndk.pool.on("added", (relay) => {
            this.onUpdate()
            console.log("Added relay:", relay.url)
            if (this.autoConnect) {
                console.log("Autoconnecting...")
                relay.connect()
            }
            this.makeKnownAll()
            this.save()
        })
        this.ndk.pool.on("removed", (relay) => {
            this.onUpdate()
        })

        this.loadSettins()
        this.load()
        this.onConnectedUpdate()
    }
}

