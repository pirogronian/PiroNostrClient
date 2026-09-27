
import { EventEmitter } from "tseep"
import $ from "jquery"
import Navigo from "navigo"
import NDK, { NDKEvent, NDKRelay, NDKRelaySet, NDKPool,
     NDKSubscriptionCacheUsage, type NDKFilter, nip19,
     NDKSubscription, type NDKSubscriptionOptions,
    isNip33AValue, filterFromId, relaysFromBech32 } from "@nostr-dev-kit/ndk"
import { Router } from "@/Router.js"
import { InnerUrl, InnerLink, MakeLinkInner } from "./various.js"

export type NDKSubscriptionEventHandlers = Parameters<NDK['subscribe']>[1];

export interface SettingsManager {
    settings(key: string, value: string|undefined|null): string|null|void;
    publish(relaySet?: NDKRelaySet, timeoutMs?: number, requiredRelayCount?: number): Promise<void> ;
}

function correctRelaySet(relaySet: NDKRelaySet, pool: NDKPool): NDKRelaySet {
    const connectedRelays = pool.connectedRelays();
    const includesConnectedRelay = Array.from(relaySet.relays).some((relay) => {
        return connectedRelays.map((r) => r.url).includes(relay.url);
    });

    if (!includesConnectedRelay) {
        // Add connected relays to the relay set
        for (const relay of connectedRelays) {
            relaySet.addRelay(relay);
        }
    }

    // if connected relays is empty (such us when we're first starting, add all relays)
    if (connectedRelays.length === 0) {
        for (const relay of pool.relays.values()) {
            relaySet.addRelay(relay);
        }
    }

    return relaySet;
}

export class Module extends EventEmitter {
    settingsName!: string
    routingName!: string
    parent: Module|undefined
    settingsSeparator: string = "."
    routingSeparator: string = "/"
    settingsPath:string = ""
    routingPath:string = ""
    router: Router|null = null
    ndk!: NDK
    static current: string = ""
    static offline: boolean|null = null
    static settingsManager: SettingsManager|undefined
    context: number = 0

    register(name: string, routingNane: string|null = null, parent: Module|undefined = undefined) {
        this.settingsName = name
        if (routingNane)
            this.routingName = routingNane
        else
            this.routingName = name
        this.parent = parent
        if (this.parent) {
            this.settingsPath = this.parent.settingsPath.concat(this.settingsSeparator).concat(this.settingsName)
            this.routingPath = this.parent.routingPath.concat(this.routingSeparator).concat(this.routingName)

            if (this.parent.router)
                this.router = this.parent.router

            if (this.parent.ndk)
                this.ndk = this.parent.ndk
        } else {
            this.settingsPath = this.settingsName
        }
    }

    settings(name: string, value: string|undefined|null = undefined): string|null|void {
        const ret: string|undefined = undefined
        const key = this.settingsPath.concat(this.settingsSeparator).concat(name)

        return Module.settingsManager?.settings(key, value)
    }

    isCurrent() {
        return Module.current == this.routingPath
    }

    setCurrent() {
        Module.current = this.routingPath
    }

    newContext() {
        this.context += 1
    }

    sameContext(context: number): boolean {
        return this.isCurrent() && this.context == context
    }

    onRoute(pattern: string, f: Function) {
        this.router?.onRoute(this.routingPath.concat(pattern), f)
    }

    navigate(addr: string = "") {
        console.log("Module.navigate:", addr)
        this.router?.navigate(this.url(addr))
    }

    async fetchEvent(idOrFilter: string | NDKFilter | NDKFilter[],
        opts?: NDKSubscriptionOptions,
        relaySetOrRelay?: NDKRelaySet | NDKRelay
    ): Promise<NDKEvent|null> {
        if (!opts) opts = {}
        if (Module.offline)
            opts.cacheUsage = NDKSubscriptionCacheUsage.ONLY_CACHE
        console.log("fetchEvent:", opts)
        return this.ndk.fetchEvent(idOrFilter, opts, relaySetOrRelay)
    }

    subscribe(
        idOrFilter: string | NDKFilter | NDKFilter[],
        opts?: NDKSubscriptionOptions,
        autoStartOrRelaySet: NDKRelaySet | boolean | NDKSubscriptionEventHandlers = true,
        _autoStart = true,)
        : NDKSubscription
    {
        let filters: NDKFilter[];
        let relaySet: NDKRelaySet | undefined;

        if (!opts)  opts = {}

        // if no relayset has been provided, try to get one from the event id
        if (!(typeof autoStartOrRelaySet == "object" && autoStartOrRelaySet instanceof NDKRelaySet)
             && typeof idOrFilter === "string") {
            /* Check if this is a NIP-33 */
            if (!isNip33AValue(idOrFilter)) {
                const relays = relaysFromBech32(idOrFilter, this.ndk);

                if (relays.length > 0) {
                    relaySet = new NDKRelaySet(new Set<NDKRelay>(relays), this.ndk);

                    // Make sure we have connected relays in this set
                    relaySet = correctRelaySet(relaySet, this.ndk.pool);
                }
            }
        }

        if (typeof idOrFilter === "string") {
            try {
                const decoded = nip19.decode(idOrFilter);

                if (decoded.type === 'naddr') {
                    const data = decoded.data;
                    const filter: NDKFilter = {
                        kinds: [data.kind],
                        authors: [data.pubkey]
                    };

                    if (!data.identifier)  console.warn("Event id not provided in naddr!")
                    if (data.identifier !== undefined) {
                        filter["#d"] = [data.identifier];
                    }

                    filters = [filter];
                } else if (decoded.type === 'nevent') {
                    filters = [{ ids: [decoded.data.id] }];
                } else if (decoded.type === 'note') {
                    filters = [{ ids: [decoded.data] }];
                } else {
                    // Fallback dla surowego ID w hex lub innych typów
                    filters = [filterFromId(idOrFilter)];
                }
            } catch {
                // Jeśli to nie jest bech32 (np. surowy hex ID lub tag 'd')
                filters = [filterFromId(idOrFilter)];
            }
        } else if (Array.isArray(idOrFilter)) {
            filters = idOrFilter;
        } else {
            filters = [idOrFilter];
        }

        // Run guardrails check on the filter when it's passed as an object (not a string)
        if (typeof idOrFilter !== "string") {
            this.ndk.aiGuardrails?.ndk?.fetchingEvents(filters);
        }

        if (filters.length === 0) {
            throw new Error(`Invalid filter: ${JSON.stringify(idOrFilter)}`);
        }

        if (relaySet)  opts.relaySet = relaySet

        //console.debug("Module.subscribe:", filters, opts, autoStartOrRelaySet, _autoStart)

        return this.ndk.subscribe(filters, opts, autoStartOrRelaySet, _autoStart)
    }

    setup() {}

    mainView(content = null) {
        const mv = $("#MainView")
        if (content)
            mv.append(content)
        else
            return mv
    }

    hideMessages() {
        $("#Notice").hide()
        $("#Warning").hide()
        $("#Error").hide()
    }

    notice(msg: string) {
        const node = $("#Notice")
        node.find(".Message").text(msg)
        node.show()
    }

    warning(msg: string) {
        const node = $("#Warning")
        node.find(".Message").text(msg)
        node.show()
    }

    error(msg: string) {
        const node = $("#Error")
        node.find(".Message").text(msg)
        node.show()
    }

    clearUI() {
        this.hideMessages()
        this.mainView().empty()
    }

    url(addr: string): string {
        return this.routingPath.concat(addr)
    }

    innerUrl(addr: string): string {
        return InnerUrl(this.url(addr))
    }

    innerLink(addr: string, text: string) {
        return `<a inner="${addr}" class="inner" href=${this.innerUrl(addr)}>${text}</a>`
    }

    makeLinkInner(node, addr: string, text: string|undefined|null = null) {
        node.attr("inner", addr)
        node.attr("href", this.innerUrl(addr))
        node.attr("class", "inner")
        if (text !== null)
            node.text(text)
        return node
    }

    activeLink(addr: string, text: string) {
        const link = $(this.innerLink(addr, text))
        link.click((e) => {
            e.preventDefault()
            this.navigate($(e.currentTarget).attr("inner"))
        })
        return link
    }

    makeLinkActive(node, addr: string, text: string|undefined|null = null) {
        const link = this.makeLinkInner(node, addr, text)
        link.click((e) => {
            e.preventDefault()
            this.navigate($(e.currentTarget).attr("inner"))
        })
    }
}
