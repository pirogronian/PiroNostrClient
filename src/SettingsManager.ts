
import { EventEmitter } from "tseep"

import NDK, { NDKEvent, NDKRelay, NDKRelaySet, type NDKFilter } from "@nostr-dev-kit/ndk"
import { CurrentTime, TimeToISO, TimeToUnix } from "./various.js"

const EVENT_KIND = 30078

export class SettingsManager extends EventEmitter {
    readonly MODIFIED_EVENT = "modified"
    readonly PUBLISHED_EVENT = "published"
    readonly SYNCED_EVENT = "synced"

    ndk: NDK
    _settings: Record<string, string> = {}
    modified: boolean = false
    timeKey: string = "SettingsTime"
    time: number = 0

    constructor(ndk: NDK, timeKey?: string) {
        super()
        this.ndk = ndk
        if (timeKey)  this.timeKey = timeKey

        const timeStr = localStorage.getItem(this.timeKey)
        if (timeStr) {
            this.time = TimeToUnix(timeStr)
        }
    }

    updateTime() {
        this.time = CurrentTime()
        const timeStr = TimeToISO(this.time)
        localStorage.setItem(this.timeKey, timeStr)
    }

    settings(key: string, value: string|undefined|null = undefined): string|null|void {
        let ret: string|null = null

        if (value) {
            this._settings[key] = value
            localStorage.setItem(key, value)
            this.modified = true
            this.updateTime()
            this.emit(this.MODIFIED_EVENT)
        }
        if (value === null) {
            console.log("Removing item:", key)
            delete this._settings[key]
            localStorage.removeItem(key)
            this.modified = true
            this.updateTime()
            this.emit(this.MODIFIED_EVENT)
        }
        if (Object.keys(this._settings).includes(key))  return this._settings[key]
        ret = localStorage.getItem(key)
        if (ret) {
            this._settings[key] = ret
            /*this.modified = true
            this.emit(this.MODIFIED_EVENT)*/
        }
        //console.debug("settings:", key, value, ret)
        return ret
    }

    sync() {
        const pubkey = this.ndk.activeUser?.pubkey
        const cname = this.ndk.clientName
        if (!pubkey || !cname)  return
        const filter: NDKFilter = {
            kinds: [ EVENT_KIND ],
            authors: [ pubkey ],
            "#d": [ cname ]
        }

        this.ndk.subscribe(
            filter,
            { closeOnEose : true },
            { onEvent: (event) => {
                this.onSync(event)
            } })
    }

    onSync(event: NDKEvent) {
        console.debug("Got settings event:", event)
        if (event.pubkey != this.ndk.activeUser?.pubkey) {
            console.warn("Got not mine event!")
            return
        }
        const settings = JSON.parse(event.content)
        const time = TimeToUnix(settings[this.timeKey])
        if (time <= this.time) {
            console.debug("Remote settings time older than local:", this.time - time)
            return
        }
        for (const key in settings) {
            this._settings[key] = settings[key]
            localStorage.setItem(key, settings[key])
        }
        this.time = time
        //localStorage.setItem(this.timeKey, TimeToISO(this.time))
        this.modified = false
        this.emit(this.SYNCED_EVENT)
    }

    async publish(relaySet?: NDKRelaySet, timeoutMs?: number, requiredRelayCount?: number): Promise<void> {
        const event = new NDKEvent(this.ndk)

        this._settings[this.timeKey] = TimeToISO(this.time)
        event.kind = EVENT_KIND
        event.dTag = this.ndk.clientName
        event.content = JSON.stringify(this._settings)
        //console.debug(event.content)

        console.debug("Publish settings event:", event)
        await event.publishReplaceable(relaySet, timeoutMs, requiredRelayCount)
        this.modified = false
        this.emit(this.PUBLISHED_EVENT)
    }
}
