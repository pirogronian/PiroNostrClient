
import { NDKEvent, NDKRelay, NDKSubscription, matchFilter, type NDKRawEvent, type NostrEvent } from "@nostr-dev-kit/ndk";

export namespace Subscription {

    export function setup() {
        const origEvRecv = NDKSubscription.prototype.eventReceived;

        const newEvRecv = function(
            this: NDKSubscription,
            event: NDKEvent|NostrEvent,
            relay: NDKRelay| undefined,
            fromCache: boolean = false,
            optimisticPublish: boolean = false)
        {
            const e = event instanceof NDKEvent? event.rawEvent() : event
            if (e.kind === undefined)  e.kind = -1
            const matchesAny = this.filters.some((filter) => { return matchFilter(filter, e as NDKRawEvent) })
            if (!matchesAny) {
                console.warn("Event don't match any filter:", e, this.filters)
                return
            }

            return origEvRecv.call(this, event, relay, fromCache, optimisticPublish)
        }

        NDKSubscription.prototype.eventReceived = newEvRecv
    }
}
