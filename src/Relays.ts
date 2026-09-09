
import $ from "jquery"
import NDK, { NDKRelay, NDKRelayStatus } from "@nostr-dev-kit/ndk";
import { Module } from "./Module.js";

import RelaysHTML from "@/Relays.html?raw"
import ActiveRelayHTML from "@/ActiveRelay.html?raw"

const STORAGE_KEY = 'used';

const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://purplepag.es'
];

export class Relays extends Module {
    autoAdd: boolean = true

    challenges: { [url: string] : string } = {}
    notices: { [url: string] : string } = {}

    saveSettings() {
        this.settings("autoAdd", this.autoAdd ? "1" : null)
    }

    loadSettins() {
        this.autoAdd = this.settings("autoAdd") ? true : false
    }

    get() {
        return this.ndk.pool.relays.values();
    }

    getUrls() {
        return this.ndk.pool.relays.keys();
    }

    save(): void {
        const relayUrls = Array.from(this.ndk.pool.relays.keys());
        this.settings(STORAGE_KEY, JSON.stringify(relayUrls));
    }

    getStored(): string[] {
        const saved = this.settings(STORAGE_KEY);
        if (!saved) return []

        try {
            const parsed = JSON.parse(saved);
            return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_RELAYS;
        } catch {
            return [];
        }
    }

    load(): void {
        const urls = this.getStored()
        urls.forEach((url) => { 
            this.add(url)
        })
    }

    add(url: string|NDKRelay) {
        let relay: NDKRelay
        if (typeof url == "string") {
            relay = new NDKRelay(url, undefined, this.ndk)
        }
        else
            relay = url
        if (relay)
            this.ndk.pool.addRelay(relay, true)
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
        if (this.autoAdd)
            aac.prop("checked", true)
        aac.change(() => {
            this.autoAdd = aac.prop("checked")
            this.saveSettings()
        })
        Head.find("#AddDefaultsRelays").click(() => {
            DEFAULT_RELAYS.forEach((relay) => {
                this.add(relay)
            })
            this.save()
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
            if (!stored.includes(relay.url)) {
                arn.find(".New").show()
            }
            arn.find(".Challenge").text(this.challenges[relay.url])
            arn.find(".Notice").text(this.notices[relay.url])
            arn.find("button.RemoveRelayButton").click((e) => {
                console.log("Removing:", relay.url)
                this.remove(relay.url)
                this.save()
                this.handle()
            })

            UIList.append(arn)
        })
        const urls = Array.from(this.getUrls())
        stored.forEach((url) => {
            if (!urls.includes(url)) {
                const urn = $(ActiveRelayHTML)
                urn.find("a").text(url).attr("href", url)
                const s = urn.find(".RelayStatus")
                s.text("unused")
                s.addClass("unused")
                urn.find(".Challenge").text(this.challenges[url])
                urn.find(".Notice").text(this.notices[url])
                UIList.append(urn)
            }
        })
    }

    handle() {
        this.clearUI()
        this.loadSettins()
        this.show()
    }

    setup() {
        this.onRoute("", (match) => {
            this.handle()
        })
        this.makeLinkActive($("#RelaysLink"), "")
        this.ndk.pool.on('relay:connect', () => {
            if (this.autoAdd)
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

