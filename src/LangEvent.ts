
import { NDKEvent } from "@nostr-dev-kit/ndk"
import { LangTools } from "./LangTools.js";

export interface LangEvent {
    getLanguages(auto: boolean): { code: string, standard: string }[];
    getLanguage(auto: boolean): { code: string, standard: string }|null
    removeLanguage(code: string, standard?: string): void;
    removeAllLangs(): void;
    addLanguage(code: string, standard: string): void
}

export function CreateLangEvent<T extends NDKEvent>(event: T): T & LangEvent {
    const langEvent = event as T & LangEvent

    langEvent.getLanguages = function (auto: boolean) {
        let ret: { code: string, standard: string }[] = []

        this.tags.forEach((tag) => {
            if (tag[0] == "l" && tag[1]) {
                const code = tag[1]
                let standard: string|null|undefined = tag[2]
                if (!standard) {
                    if (auto) {
                        standard = LangTools.detectStandard(code)
                        if (standard)  ret.push({ code: code, standard: standard })
                    }
                } else {
                    if (standard in LangTools.Standards)
                        ret.push({ code: code, standard: standard })
                }
            }
        })

        return ret
    }

    langEvent.getLanguage = function(auto: boolean) {
        const ret = this.getLanguages(auto)
        if (ret.length && ret[0])  return ret[0]
        return null
    }

    langEvent.addLanguage = function(code: string, standard = LangTools.Standards.BCP47) {
        if (!this.getMatchingTags("L", standard, { markerIndex: 1, useCase: false }))
            this.tags.push(["L", standard])
        this.tags.push(["l", code, standard])
    }

    langEvent.removeLanguage = function(code: string, standard?: string) {
        if (standard)
            this.removeTag(["l", code, standard], false, { useCase: false })
        else 
            this.removeTag(["l", code], false, { useCase: false })
    }

    return langEvent
}
