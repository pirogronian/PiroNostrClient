
import { NDKEvent, NDKRelay, NDKSubscription, matchFilter,
    type NDKRawEvent, type NostrEvent, type NDKFilter } from "@nostr-dev-kit/ndk";

export namespace Subscription {


    function filterIncludesIds(filter: NDKFilter): boolean {
        return !!filter.ids;
    }

    function resultHasAllRequestedIds(subscription: NDKSubscription): boolean {
        const ids = subscription.filter.ids;

        return !!ids && ids.length === subscription.eventFirstSeen.size;
    }

    /**
     * Checks if a subscription is fully guaranteed to have been filled.
     *
     * This is useful to determine if a cache hit fully satisfies a subscription.
     *
     * @param subscription
     * @returns
     */
    function queryFullyFilled(subscription: NDKSubscription): boolean {
        if (filterIncludesIds(subscription.filter)) {
            if (resultHasAllRequestedIds(subscription)) {
                return true;
            }
        }

        return false;
    }


    interface Subscription {
        mostRecentCacheEventTimestamp: number
        shouldQueryRelays: () => boolean
        startWithRelays: () => void
        startPoolMonitor: () => void
        shouldQueryCache: () => boolean
        startWithCache: () => NDKEvent[] | Promise<NDKEvent[]>
        shouldWaitForCache: () => boolean
    }

    /**
     * Start the subscription. This is the main method that should be called
     * after creating a subscription.
     *
     * @param emitCachedEvents - Whether to emit events coming from a synchronous cache
     *
     * When using a synchronous cache, the events will be returned immediately
     * by this function. If you will use those returned events, you should
     * set emitCachedEvents to false to prevent seeing them as duplicate events.
     */
    function start(this: NDKSubscription, emitCachedEvents = true): NDKEvent[] | null {
        let cacheResult: NDKEvent[] | Promise<NDKEvent[]>;

        const self = this as unknown as Subscription

        const updateStateFromCacheResults = (events: NDKEvent[]) => {
            if (events.length === 0) {
                if (!emitCachedEvents) cacheResult = events;
                return;
            }

            // If we're not emitting events (onEvents mode), just set NDK reference and return
            if (!emitCachedEvents) {
                // Calculate most recent timestamp for addSinceFromCache functionality
                let maxTimestamp = self.mostRecentCacheEventTimestamp || 0;
                for (const event of events) {
                    event.ndk = this.ndk;
                    if (event.created_at && event.created_at > maxTimestamp) {
                        maxTimestamp = event.created_at;
                    }
                }
                self.mostRecentCacheEventTimestamp = maxTimestamp;
                cacheResult = events;
                return;
            }

            // Regular path: emit events individually
            // Calculate most recent timestamp in a single pass
            let maxTimestamp = self.mostRecentCacheEventTimestamp || 0;
            for (const event of events) {
                if (event.created_at && event.created_at > maxTimestamp) {
                    maxTimestamp = event.created_at;
                }
            }
            self.mostRecentCacheEventTimestamp = maxTimestamp;

            // Process and emit each event
            for (const event of events) {
                this.eventReceived(event, undefined, true, false);
            }
        };

        const loadFromRelays = () => {
            if (self.shouldQueryRelays()) {
                self.startWithRelays();
                if (!this.exclusiveRelay)  self.startPoolMonitor();
                else console.debug("Don't start pool monitor.")
            } else {
                this.emit("eose", this);
            }
        };

        if (self.shouldQueryCache()) {
            cacheResult = self.startWithCache();

            if (cacheResult instanceof Promise) {
                // The cache is asynchronous
                if (self.shouldWaitForCache()) {
                    // If we need to wait for it
                    cacheResult.then((events) => {
                        // If onEvents provided, use batch processing
                        if (this.opts.onEvents) {
                            // Set NDK reference and calculate timestamp
                            let maxTimestamp = self.mostRecentCacheEventTimestamp || 0;
                            for (const event of events) {
                                event.ndk = this.ndk;
                                if (event.created_at && event.created_at > maxTimestamp) {
                                    maxTimestamp = event.created_at;
                                }
                            }
                            self.mostRecentCacheEventTimestamp = maxTimestamp;
                            // Call the batch handler
                            this.opts.onEvents(events);
                        } else {
                            // Regular processing (no batch handler provided)
                            updateStateFromCacheResults(events);
                        }

                        // if the cache has a hit, return early
                        if (queryFullyFilled(this)) {
                            this.emit("eose", this);
                            return;
                        }
                        loadFromRelays();
                    });
                    return null;
                }
                cacheResult.then((events) => {
                    // If onEvents provided, use batch processing
                    if (this.opts.onEvents) {
                        // Set NDK reference and calculate timestamp
                        let maxTimestamp = self.mostRecentCacheEventTimestamp || 0;
                        for (const event of events) {
                            event.ndk = this.ndk;
                            if (event.created_at && event.created_at > maxTimestamp) {
                                maxTimestamp = event.created_at;
                            }
                        }
                        self.mostRecentCacheEventTimestamp = maxTimestamp;
                        // Call the batch handler
                        this.opts.onEvents(events);
                    } else {
                        // Regular processing (no batch handler provided)
                        updateStateFromCacheResults(events);
                    }

                    // If we're only using cache, emit EOSE after cache results arrive
                    if (!self.shouldQueryRelays()) {
                        this.emit("eose", this);
                    }
                });

                // Only load from relays if we should query them
                if (self.shouldQueryRelays()) {
                    loadFromRelays();
                }

                return null;
            }
            updateStateFromCacheResults(cacheResult);

            if (queryFullyFilled(this)) {
                this.emit("eose", this);
            } else {
                loadFromRelays();
            }

            return cacheResult;
        }
        loadFromRelays();
        return null;
    }

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
        NDKSubscription.prototype.start = start
    }
}
