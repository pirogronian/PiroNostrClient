import { NDKEvent } from "@nostr-dev-kit/ndk";

export async function safeAsync<T>(promise: Promise<T>): Promise<[Error | null, T | null]> {
    try {
        const data = await promise;
        return [null, data];
    } catch (err) {
        return [err as Error, null];
    }
}

export function formatNip54TagD(title: string): string {
  return title
    // 1. Normalizacja Unicode (rozbija znaki diakrytyczne, np. "ę" -> "e" + akcent)
    .normalize('NFD')
    // 2. Usunięcie znaków diakrytycznych (znaki z zakresu Combining Diacritical Marks)
    .replace(/[\u0300-\u036f]/g, '')
    // 3. Sprowadzamy wszystko do małych liter
    .toLowerCase()
    // 4. Zastąpienie spacji i znaków specjalnych (z wyjątkiem /) łącznikiem
    // Wszelkie znaki inne niż litery, cyfry i '/' zamieniamy na '-'
    .replace(/[^a-z0-9/]+/g, '-')
    // 5. Usunięcie łączników sąsiadujących ze slashami (np. "/-" lub "-/")
    .replace(/-?\/-?/g, '/')
    // 6. Usunięcie wielokrotnych slaszy (np. "//" -> "/")
    .replace(/\/+/g, '/')
    // 7. Usunięcie wielokrotnych łączników z rzędu (np. "--" -> "-")
    .replace(/-+/g, '-')
    // 8. Trim łączników i slaszy z początku oraz końca całego ciągu
    .replace(/^[-/]+|[-/]+$/g, '');
}

export function EventTagValues(event: NDKEvent, tagName: string) : string[] {
    return event.tags.filter((tag) => tag[0] == tagName).map((tag) => tag[1])
}

export function InnerUrl(url: string): string {
    return window.location.pathname.concat("#".concat(url))
}

export function InnerLink(url: string, text: string = "") {
    return `<a inner="${url}" class="inner" href=${InnerUrl}>${text}</a>`
}

export function MakeLinkInner(node, url: string, text: string|null = null) {
    node.attr("inner", url)
    node.attr("href", InnerUrl(url))
    node.attr("class", "inner")
    if (text !== null)
        node.text(text)
    //console.log("Prepared inner link:", node.html())
}
