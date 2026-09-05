
import NDK, { NDKRelay } from "@nostr-dev-kit/ndk";

const STORAGE_KEY = 'nostr-wiki-relays';

const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://purplepag.es'
];

export function getStoredRelays(): string[] {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_RELAYS;
  
    try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_RELAYS;
    } catch {
        return DEFAULT_RELAYS;
    }
}

export class Relays {
    ndk : NDK

    constructor(ndk: NDK) {
        this.ndk = ndk
    }

    save(): void {
        const relayUrls = Array.from(this.ndk.pool.relays.keys());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(relayUrls));
    }

    load(): void {
        const relays = getStoredRelays()
        relays.forEach((relay) => { this.ndk.pool.addRelay(new NDKRelay(relay, null, this.ndk), true) })
    }
}

