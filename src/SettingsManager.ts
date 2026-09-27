
import { EventEmitter } from "tseep"

import NDK, { NDKEvent, NDKRelay, NDKRelaySet } from "@nostr-dev-kit/ndk"

const EVENT_KIND = 30078

export class SettingsManager extends EventEmitter {
    readonly MODIFIED_EVENT = "modified"
    readonly PUBLISHED_EVENT = "published"

    ndk: NDK
    _settings: Record<string, string> = {}
    modified: boolean = false

    constructor(ndk: NDK) {
        super()
        this.ndk = ndk
    }

    settings(key: string, value: string|undefined|null = undefined): string|null|void {
        let ret: string|null = null

        if (value) {
            this.modified = true
            this._settings[key] = value
            localStorage.setItem(key, value)
            this.emit(this.MODIFIED_EVENT)
        }
        if (value === null) {
            console.log("Removing item:", key)
            this.modified = true
            delete this._settings[key]
            localStorage.removeItem(key)
            this.emit(this.MODIFIED_EVENT)
        }
        if (Object.keys(this._settings).includes(key))  return this._settings[key]
        ret = localStorage.getItem(key)
        if (ret) {
            this._settings[key] = ret
            this.modified = true
            this.emit(this.MODIFIED_EVENT)
        }
        //console.debug("settings:", key, value, ret)
        return ret
    }

    async publish(relaySet?: NDKRelaySet, timeoutMs?: number, requiredRelayCount?: number): boolean {
        const event = new NDKEvent(this.ndk)

        event.kind = EVENT_KIND
        event.dTag = this.ndk.clientName
        event.content = JSON.stringify(this._settings)
        //console.debug(event.content)

        let relays
        try {
            relays = await event.publishReplaceable(relaySet, timeoutMs, requiredRelayCount)
            this.modified = false
            this.emit(this.PUBLISHED_EVENT)
            return true
        } catch (error) {
            this.error(error)
            return false
        }
    }
}
