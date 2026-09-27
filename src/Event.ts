
import { NDKEvent, type NDKRawEvent, type NDKTag, nip19 } from "@nostr-dev-kit/ndk";

export namespace Event {
    export class TagFilterOptions {
        markerIndex: number = 3
        useCase: boolean = true
    }

    export function getMatchingTags(this: NDKEvent, tagName: string, marker?: string,
        options: TagFilterOptions = new TagFilterOptions()): NDKTag[] {
        const t = this.tags.filter((tag) => tag[0] === tagName);

        if (marker === undefined || options.markerIndex < 1) return t;

        if (options.useCase)
            return t.filter((tag) => tag[options.markerIndex] === marker);
        return t.filter((tag) => tag[options.markerIndex]?.toLocaleLowerCase() === marker.toLocaleLowerCase());
    }

    export function hasTag(this: NDKEvent, tagName: string, marker?: string, options: TagFilterOptions = new TagFilterOptions()): boolean {
        if (options.useCase)
            return this.tags.some((tag) => tag[0] === tagName && (!marker || tag[options.markerIndex] === marker));
        return this.tags.some((tag) => tag[0] === tagName && (!marker || tag[options.markerIndex]?.toLocaleLowerCase() === marker.toLocaleLowerCase()));
    }

    export function tagValue(this: NDKEvent, tagName: string, marker?: string, options: TagFilterOptions = new TagFilterOptions()): string | undefined {
        const tags = getMatchingTags.call(this, tagName, marker, options);
        if (tags.length === 0) return undefined;
        return tags[0][1];
    }

    export function removeTag(this: NDKEvent, tagName: string | string[], markerOrFlag?: string|boolean, options: TagFilterOptions = new TagFilterOptions()): void {
        const tagNames = Array.isArray(tagName) ? tagName : [tagName];
        if (typeof markerOrFlag != "boolean") {
            this.tags = this.tags.filter((tag) => {
                const include = tagNames.includes(tag[0]);
                let hasMarker
                if (options.useCase)
                    hasMarker = markerOrFlag ? tag[options.markerIndex] === markerOrFlag : true;
                else
                    hasMarker = markerOrFlag ? tag[options.markerIndex]?.toLocaleLowerCase() === markerOrFlag.toLocaleLowerCase() : true;

                return !(include && hasMarker);
            });
            return
        } else {
            this.tags = this.tags.filter((tag) => {
                const minIndex = tag.length < tagNames.length? tag.length : tagName.length
                if (markerOrFlag && tag.length != tagNames.length)  return true
                tag.forEach((value, index) => {
                    if (options.useCase) {
                        if (value != tagNames[index])  return true
                    } else {
                        if (value.toLocaleLowerCase() != tagNames[index]?.toLocaleLowerCase())  return true
                    }
                    if (!markerOrFlag && index == minIndex)  return false
                })
                return false
            })
        }
    }

    export function size(this: NDKEvent): number {
        let ret = this.content.length
        for (const tag of this.tags)
            for (const value of tag)
                ret += value.length
        return ret
    }

    export function naddr(e: NDKEvent): string {
        return nip19.naddrEncode(e.rawEvent())
    }

    export function nevent(e: NDKEvent): string {
        return nip19.neventEncode(e.rawEvent())
    }

    export function setup() {
        NDKEvent.prototype.getMatchingTags = getMatchingTags
        NDKEvent.prototype.hasTag = hasTag
        NDKEvent.prototype.tagValue = tagValue
        NDKEvent.prototype.removeTag = removeTag
        NDKEvent.prototype.size = size

        Object.defineProperty(NDKEvent.prototype, 'naddr', {
            get: function (this: NDKEvent) {
                return naddr(this); // lub naddr.call(this) / kod z funkcji naddr
            },
            enumerable: false,
            configurable: true,
        });

        Object.defineProperty(NDKEvent.prototype, 'nevent', {
            get: function (this: NDKEvent) {
                return nevent(this);
            },
            enumerable: false,
            configurable: true,
        });
    }
}
