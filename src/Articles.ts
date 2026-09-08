
import NDK, { NDKEvent, NDKRelay } from "@nostr-dev-kit/ndk";
import type { NDKFilter, NDKSubscription } from "@nostr-dev-kit/ndk"

import { safeAsync } from "./various.js";
import { Module } from "./Module.js";

export class Articles extends Module {
    sub: NDKSubscription | null = null
    enabled: boolean = false

    constructor() {
        super()
    }

    load(params: object,
        onEvent: (event: NDKEvent, relay?: NDKRelay) => any)
    {
        this.enabled = true
        const filter: NDKFilter = {
            kinds: [30818]
            //'#d': [pageSlug]
        };
        if (params) {
            if (params.author) {
                console.log("Subscribing with author:", params.author)
                filter.authors = [ params.author ]
            }
            if (params.id) {
                console.log("Subscribing with id:", params.id)
                filter['#d'] = [ params.id ]
            }
            for (const [key, value] of Object.entries(params)) {
                if (key.length == 1) {
                    const tkey = `#${key}`
                    if (Array.isArray(value))
                        filter[`#${key}`] = value
                    else
                        filter[`#${key}`] = [ value ]
                }
            }
            if (params.since) {
                const since = params.since
                console.log("Filter.since:", since)
                const dobj = new Date(since)
                const dn = dobj.getTime() / 1000
                filter.since = dn
            }
            if (params.unitl) {
                const until = params.unitl
                console.log("Filter.until:", until)
                const dobj = new Date(until)
                const dn = dobj.getTime() / 1000
                filter.until = dn
            }
            if (params.limit) {
                const limit = Number(params.limit)
                console.log("Filter.limit:", limit)
                filter.limit = limit
            }
        }

        console.log("Subscribing for articles with filter", filter)
        
        try {
            this.sub = this.ndk.subscribe(
                filter,
                { closeOnEose : true },
                { onEvent: onEvent })
        } catch (e) {
            return e
        }
    }

    stop() {
        if (this.sub) {
            this.sub.stop()
        }
        this.enabled = false
    }
}
