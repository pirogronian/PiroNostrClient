
import NDK, { NDKRelay } from "@nostr-dev-kit/ndk";

const STORAGE_KEY = 'nostr-wiki-relays';

const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://purplepag.es'
];

export function getStoredRelays(): string[] {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return []
  
    try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_RELAYS;
    } catch {
        return DEFAULT_RELAYS;
    }
}

export class Relays {
    ndk: NDK
    autoAdd: boolean = true

    constructor(ndk: NDK) {
        this.ndk = ndk
    }

    get() {
        return this.ndk.pool.relays.values();
    }

    getUrls() {
        return this.ndk.pool.relays.keys();
    }

    save(): void {
        const relayUrls = Array.from(this.ndk.pool.relays.keys());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(relayUrls));
    }

    load(): void {
        const urls = getStoredRelays()
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

    remove(url: string) {
        const relay = this.ndk.pool.relays.get(url)
        if (!relay)  return
        relay.disconnect()
        this.ndk.pool.removeRelay(url)
    }
}

