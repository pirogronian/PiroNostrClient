import '@nostr-dev-kit/ndk';
import { TagFilterOptions } from "@/Event.ts"

declare module '@nostr-dev-kit/ndk' {
  interface NDKEvent {
    getMatchingTags(tagName: string, marker?: string,
        options: TagFilterOptions = new TagFilterOptions()): NDKTag[];
    
    hasTag(tagName: string, marker?: string, options: TagFilterOptions = new TagFilterOptions()): boolean;

    tagValue(tagName: string, marker?: string, options: TagFilterOptions = new TagFilterOptions()): string | undefined;

    removeTag(tagName: string | string[], markerOrFlag?: string|boolean, options: TagFilterOptions = new TagFilterOptions()): void;

    size(): number;
  }
}