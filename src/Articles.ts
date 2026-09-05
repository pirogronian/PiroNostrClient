
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

    load(author : string | null,
        id : string | null,
        onEvent: (event: NDKEvent, relay?: NDKRelay) => any)
    {
        this.enabled = true
        const filter: NDKFilter = {
            kinds: [30818]
            //'#d': [pageSlug]
        };
        if (author) {
            console.log("Subscribing with author:", author)
            filter.authors = [ author ]
        }
        if (id) {
            console.log("Subscribing with id:", id)
            filter['#d'] = [ id ]
        }
        console.log("Subscribing for articles...")
        
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
