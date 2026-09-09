
import $ from "jquery"
import NDK, { NDKRelay, NDKRelayStatus, NDKRelayAuthPolicies } from "@nostr-dev-kit/ndk";
import { Module } from "./Module.js";

import RelaysHTML from "@/Relays.html?raw"
import ActiveRelayHTML from "@/ActiveRelay.html?raw"

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

export class Relays extends Module {
    autoUse: boolean = true

    known: RelaySettingsDB = {}

    challenges: { [url: string] : string } = {}
    notices: { [url: string] : string } = {}

    saveSettings() {
        this.settings("autoUse", this.autoUse ? "1" : null)
    }

    loadSettins() {
        this.autoUse = this.settings("autoUse") ? true : false
    }

    get() {
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
        this.known = this.getStored()
        console.log(this.known)
        for(const [url, info] of Object.entries(this.known)) {
            if (info.use)
                this.add(url)
        }
    }

    add(url: string|NDKRelay, connect: boolean = false) {
        let relay: NDKRelay
        if (typeof url == "string") {
            relay = new NDKRelay(url, undefined, this.ndk)
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

    show() {
        this.mainView().html(RelaysHTML)
        const used = this.get()
        const stored = this.getStored()
        const Head = $("#ActiveRelaysHeader")
        const UIList = $("#ActiveRelays")

        const NewUrl = $("input[name='NewRelayUrl']")
        Head.find("#AddRelayButton").click((e) => {
            this.add(NewUrl.val())
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
        Head.find("#AddDefaultsRelays").click(() => {
            DEFAULT_RELAYS.forEach((relay) => {
                this.add(relay)
            })
            this.handle()
        })
        Head.find("#RemoveAllRelays").click(() => {
            this.removeAll()
            this.handle()
        })
        Head.find("#SaveAllRelays").click(() => {
            this.save()
            this.handle()
        })
        Head.find("#RefreshActiveRelays").click(() => {
            this.handle()
        })

        UIList.empty()

        used.forEach((relay : NDKRelay) => {
            const arn = $(ActiveRelayHTML)
            console.log("Relay:", relay.url)
            arn.find("a").text(relay.url).attr("href", relay.url)
            let c: string = NDKRelayStatus[relay.status]
            c = c.toLocaleLowerCase()
            const s = arn.find(".RelayStatus")
            s.text(c)
            s.addClass(c)
            if (!this.known[relay.url]) {
                arn.find(".New").show()
            }
            arn.find(".Challenge").text(this.challenges[relay.url])
            arn.find(".Notice").text(this.notices[relay.url])

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
                    this.add(url)
                    this.handle()
                })
                urn.find(".Challenge").text(this.challenges[url])
                urn.find(".Notice").text(this.notices[url])
                urn.find("button.ForgetRelayButton").click(() => {
                    delete this.known[url]
                    this.save()
                    this.handle()
                })
                UIList.append(urn)
            }
        }
    }

    handle() {
        this.clearUI()
        this.loadSettins()
        this.makeKnownAll()
        this.save()
        this.show()
    }

    setup() {
        this.onRoute("", (match) => {
            this.handle()
        })
        this.makeLinkActive($("#RelaysLink"), "")
        this.ndk.pool.on('relay:connect', (relay) => {
            if (this.autoUse) {
                this.markUsed(relay.url)
            } else
                this.makeKnown(relay)
            this.save();
            this.handle()
        });
        this.ndk.pool.on("relay:disconnect", () => {
            this.handle()
        })
        this.ndk.pool.on("relay:auth", (relay: NDKRelay, challenge: string) => {
            this.challenges[relay.url] = challenge
            this.handle()
        })
        this.ndk.pool.on("relay:authed", () => {
            this.handle()
        })
        this.ndk.pool.on("notice", (relay: NDKRelay, notice: string) => {
            this.notices[relay.url] = notice
        })
        this.ndk.pool.on("connect", () => {
            this.handle()
        })
        this.ndk.pool.on("relay:connecting", () => {
            this.handle()
        })
        this.ndk.pool.on("flapping", () => {
            this.handle()
        })
    }
}

