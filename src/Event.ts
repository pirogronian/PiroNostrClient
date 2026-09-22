
import { NDKEvent, type NDKTag } from "@nostr-dev-kit/ndk";

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

    export function removeTag(this: NDKEvent, tagName: string | string[], marker?: string, options: TagFilterOptions = new TagFilterOptions()): void {
        const tagNames = Array.isArray(tagName) ? tagName : [tagName];
        this.tags = this.tags.filter((tag) => {
            const include = tagNames.includes(tag[0]);
            let hasMarker
            if (options.useCase)
                hasMarker = marker ? tag[options.markerIndex] === marker : true;
            else
                hasMarker = marker ? tag[options.markerIndex]?.toLocaleLowerCase() === marker.toLocaleLowerCase() : true;

            return !(include && hasMarker);
        });
    }

    export function setup() {
        NDKEvent.prototype.getMatchingTags = getMatchingTags
        NDKEvent.prototype.hasTag = hasTag
        NDKEvent.prototype.tagValue = tagValue
        NDKEvent.prototype.removeTag = removeTag
    }
}
