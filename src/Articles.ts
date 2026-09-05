
import NDK, { NDKEvent, NDKRelay } from "@nostr-dev-kit/ndk";
import type { NDKFilter, NDKSubscription } from "@nostr-dev-kit/ndk"

export class Articles{
    ndk: NDK
    sub: NDKSubscription | null = null
    enabled: boolean = false

    constructor(ndk: NDK) {
        this.ndk = ndk
    }

    async load(author : string | null,
        id : string | null,
        onEvent: (event: NDKEvent, relay?: NDKRelay) => any) : Promise<void>
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
        this.sub = this.ndk.subscribe(
            filter,
            { closeOnEose : true },
            { onEvent: onEvent }
        )
    }

    stop() {
        if (this.sub) {
            this.sub.stop()
        }
        this.enabled = false
    }
}
