
import NDK, { NDKEvent, NDKRelay } from "@nostr-dev-kit/ndk";
import type { NDKFilter, NDKSubscription } from "@nostr-dev-kit/ndk"

import { safeAsync } from "./various.js";

export class Articles{
    ndk: NDK
    sub: NDKSubscription | null = null
    enabled: boolean = false

    constructor(ndk: NDK) {
        this.ndk = ndk
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
