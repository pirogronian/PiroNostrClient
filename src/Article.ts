
import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";

import { safeAsync } from "./various.js";


export async function LoadArticle(ndk : NDK, addr : string) : Promise<NDKEvent|Error|string> {
    const [err, wikiEvent] = await safeAsync(ndk.fetchEvent(addr));
    if (err) { return err
    } else {
        if (wikiEvent === null) {
            return "No event found!"
        } else {
            if (wikiEvent.kind == 30818) {
                return wikiEvent
            } else {
                return `Wrong kind of event (${wikiEvent.kind})`
            }
        }
    }
}
