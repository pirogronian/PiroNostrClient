
import $ from "jquery"

import NDK, { NDKWiki, NDKEvent } from "@nostr-dev-kit/ndk";

import { createJSONEditor, createKeySelection } from "vanilla-jsoneditor";

import { convert as ADConvert, Document as ADDocument } from '@asciidoctor/core';
import { parse as DjotParse, renderHTML as DJotRenderHTML } from '@djot/djot';

import { Module } from "@/Module.js"
import { App } from "@/App.js"
import { safeAsync, formatNip54TagD, EventTagValues, FormattedTime, FormattedBytes } from "@/various.js";

import ArticleViewHTML from '@/Article.html?raw';

const LAST_ARTICLE_FORMAT_KEY = "last_format"
const USE_LAST_ARTICLE_FORMAT_KEY = "use_last_format"

export class Article extends Module {
    event: NDKEvent|null = null
    wiki?: NDKWiki
    lastFormat: string = ""
    useLastFormat: string = "1"

    constructor() {
        super()
    }

    saveSettings() {
        this.settings(LAST_ARTICLE_FORMAT_KEY, this.lastFormat)
        this.settings(USE_LAST_ARTICLE_FORMAT_KEY, this.useLastFormat)
    }

    restoreSettings() {
        let tmp = this.settings(LAST_ARTICLE_FORMAT_KEY)
        this.lastFormat = tmp ? tmp : ""
        tmp = this.settings(USE_LAST_ARTICLE_FORMAT_KEY)
        this.useLastFormat = tmp ? tmp : ""
    }

    setEvent(event: NDKEvent) {
        this.event = event
        this.wiki = NDKWiki.from(event)
    }

    showRawEvent(target) : void {
        const rawObject = this.event?.rawEvent();
  
        const jsonString = JSON.stringify(rawObject, null, 2);

        createJSONEditor({
            target: target,
            props: {
                content: { json: jsonString },
                readOnly: true, // tryb podglądu
                mode: 'tree'   // lub 'tree',
            }
        })
    }

    asciidocCreateWikilinks(element) {
        element.find("a").each(function() {
            const node = $(this)
            //console.log("Checking node:", $(this).prop("nodeName"))
            //console.log("Checking node:", node)
            if (!node.text() && !node.attr("href")) {
                App.get().articles.makeLinkActive(node, `?id=${formatNip54TagD(node.attr("id"))}`, node.attr("id"))
                /*node.text(node.attr("id"))
                node.attr("href", InnerUrl(`/articles?id=${formatNip54TagD(node.attr("id"))}`))*/
            }
        })
    }

    async asciidoc(content : string) : Promise<string|ADDocument> {
        return await ADConvert(content, {
            safe: 'secure', // Bezpieczne parsowanie (odrzuca potencjalnie groźne skrypty)
            attributes: {
                showtitle: true // Pokazuje główny tytuł artykułu w wygenerowanym HTML
            }
        });
    }

    djotCreateWikilinksBefore(text: string) {
        return text.replace(/\[([^\]]+)\]\[([^\]]+)\]/g, '[$1](wiki:$2)');
    }

    djotCreateWikilinksAfter(element) {
        element.find("a").each(function() {
            const node = $(this)
            //console.log("Checking node:", $(this).prop("nodeName"))
            //console.log("Checking node:", node)
            if (!node.attr("href")) {
                App.get().articles.makeLinkActive(node, `?id=${formatNip54TagD(node.text())}`)
                //node.attr("href", LocalUrl(`#/articles?id=${formatNip54TagD(node.text())}`))
            }
        })
    }

    djot(content: string) : string {
        content = this.djotCreateWikilinksBefore(content)
        const ast = DjotParse(content);
        return DJotRenderHTML(ast);
    }

    plaintext(content : string) : string {  return content}

    createWikiLinksFromTextNodes(container: HTMLElement): void {
        const wikiLinkRegex = /\[\[([^\]|]+)(?:|([^\]]+))?\]\]/g;

        // 1. Tworzymy TreeWalker, który szuka wyłącznie węzłów tekstowych
        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    // Ignorujemy bloki kodu, skrypty i już istniejące linki
                    const parentTag = node.parentElement?.tagName.toUpperCase();
                    if (
                    parentTag === 'CODE' || 
                    parentTag === 'PRE' || 
                    parentTag === 'SCRIPT' || 
                    parentTag === 'STYLE' || 
                    parentTag === 'A'
                    ) {
                    return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const nodesToProcess: Text[] = [];
        let currentNode = walker.nextNode();

        // Zbieramy węzły do osobnej tablicy, aby nie modyfikować DOM w trakcie walkingu
        while (currentNode) {
            wikiLinkRegex.lastIndex = 0; // Resetujemy stan wyrażenia regularnego
            if (wikiLinkRegex.test(currentNode.nodeValue || '')) {
                nodesToProcess.push(currentNode as Text);
            }
            currentNode = walker.nextNode();
        }

        // 2. Podmieniamy zawartość tekstową na elementy <a>
        for (const textNode of nodesToProcess) {
            const text = textNode.nodeValue || '';
            wikiLinkRegex.lastIndex = 0; // Resetujemy stan wyrażenia regularnego

            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            let match: RegExpExecArray | null;

            while ((match = wikiLinkRegex.exec(text)) !== null) {
                const matchIndex = match.index;
                let target
                if (match[1])  target = match[1].trim();
                else continue;
                const alias = match[2] ? match[2].trim() : target;

                // Dodajemy tekst przed linkiem
                if (matchIndex > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.slice(lastIndex, matchIndex)));
                }

                // Tworzymy klikalny link <a> dla Wikilink
                const a = document.createElement('a');
                App.get().articles.makeLinkActive($(a), `?id=${encodeURIComponent(formatNip54TagD(target))}`, alias)
                a.dataset.target = target; // Przydatne dla Nostr Wiki (np. szukanie eventu po tagu d)

                fragment.appendChild(a);
                lastIndex = wikiLinkRegex.lastIndex;
            }

            // Dodajemy pozostały tekst po ostatnim matchu
            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
            }

            // Zastępujemy stary węzeł tekstowy nowym fragmentem DOM
            textNode.parentNode?.replaceChild(fragment, textNode);
        }
    }

    async createNode(format: string|null = null, content: string|null = null) {
        let testDOM = $("<p>[[The Adventures of Philibert, Captain Virgin]]</p>")
        this.createWikiLinksFromTextNodes(testDOM.get(0))
        console.debug("Test wikilinks:", testDOM.html())

        if (!content) {
            if (this.event)
                content = this.event.content
            else
                return
        }
        let cnt: string|ADDocument = ""
        let ret
        switch(format) {
            case "asciidoc":
                cnt = await this.asciidoc(content)
                ret = $(cnt)
                this.asciidocCreateWikilinks(ret)
                this.createWikiLinksFromTextNodes($("<div>").append(ret).get(0))
                break
            case "djot":
                cnt = this.djot(content)
                ret = $(cnt)
                this.djotCreateWikilinksAfter(ret)
                this.createWikiLinksFromTextNodes($("<div>").append(ret).get(0))
                break
            default:
                cnt = this.plaintext(content)
                ret = $("<div>").text(cnt)
        }

        return ret
    }
    
    showContent(format: string|undefined ) {
        console.log("Showing content with format:", format)
        const p = this.createNode(format)
        p.then((n) => {
            if (this.isCurrent()) {
                $("#ArticleContentView").html("")
                $("#ArticleContentView").append(n)
            }
        })
    }

    setFormatSelector(format: string|null = null) {
        const select = $("#ContentTypeSelect")
        switch(format) {
            case "asciidoc":
                select.val(format)
                break
            case "djot":
                select.val(format)
                break
            default:
                select.val("plain")
        }
    }

    async show() {
        if (!this.event || !this.wiki) {
            console.log("No event!")
            return
        }

        this.restoreSettings()

        const o = $(ArticleViewHTML)
        App.get().articles.makeLinkActive(o.find("h1 a"), `?id=${this.wiki.dTag}`, this.wiki.title)
        //o.find("h1 a").text(this.event.tagValue("title")).attr("href", LocalUrl(`#/articles?id=${this.event.tagValue("d")}`))
        o.find("#RawArticleContent").text(this.wiki.content)
    
        const user = await App.get().user.get(this.event.pubkey)
        if (!this.isCurrent())  return
        const img = o.find("img#AuthorPicture")
        if (user && user.profile && user.profile.picture)
            img.attr("src", user.profile.picture)
        else
            img.hide()
        let nick = user?.profile?.name
        if (!nick) nick = "author"
        App.get().user.makeLinkActive(o.find("a#AuthorNick"), `/${this.event.pubkey}`, nick)
            //o.find("a#AuthorNick").text(user.profile.name).attr("href", LocalUrl(`#/articles?author=${user.pubkey}`))
        o.find("#CreationTime").text(FormattedTime(this.event.created_at))
        App.get().articles.makeLinkActive(o.find("a#ArticleId"), `?id=${this.event.tagValue("d")}`, this.event.tagValue("d"))
        //o.find("a#ArticleId").text(this.event.tagValue("d")).attr("href", LocalUrl(`#/articles?id=${this.event.tagValue("d")}`))
        const summary = this.wiki.summary
        if (summary)
            o.find("#ArticleSummary").text(summary)
        else
            o.find("#ArticleSummary").hide()

        let origin = this.event.tagValue("e")
        if (!origin) origin = this.event.tagValue("a")
        const oa = o.find("#OriginLink")
        if (origin) {
            this.makeLinkActive(oa, `/${origin}`)
        } else oa.hide()

        const topics = EventTagValues(this.event, "t")
        const HeadTopics = o.find("#ArticleTopics")
        topics.forEach(function(topic) {
            const a = $(App.get().articles.activeLink(`?t=${topic}"`, topic))
            HeadTopics.append(a)
        })
        if (!topics.length)
            HeadTopics.hide()

        const co = o.find("#ArticleClient")
        const client = this.event.tagValue("client")
        if (client) co.text(`Created with: ${client}`)
        else co.hide()

        const rc = o.find("#ArticleRelays")
        let rn = $("<div>").text(this.event?.relay?.url)
        rc.append(rn)
        this.event.onRelays.forEach((relay) => {
            if (relay.url == this.event?.relay?.url)
                return
            let rn = $("<div>").text(relay.url)
            rc.append(rn)
        })
        o.find("#EventSize").text(`Size: ${FormattedBytes(this.eventSize(this.event), 2)}`)

        this.mainView(o)

        const ulf = $("input[name='uselastformat']")
        if (this.useLastFormat)  ulf.prop("checked", "checked")
        ulf.change(() => {
            console.log("Checked")
            this.useLastFormat = ulf.prop("checked") ? "1" : ""
            this.saveSettings()
        })

        $("#ContentTypeSelect").change((e) => {
            let fmt = $(e.currentTarget).val()
            this.showContent(fmt)
            this.lastFormat = fmt
            this.saveSettings()
            console.log("Change content type:", fmt)
        })
    
        const select = $("#ContentTypeSelect")
        let fmt = this.event.tagValue("f")
        if (!fmt && this.useLastFormat)
            fmt = this.lastFormat
        this.setFormatSelector(fmt)
        this.showContent(fmt)

        function SwitchView() {
            const type = $("input[name='ViewType']:checked").val()
            if (type == "article") {
                $('#RawEventView').hide()
                $("#ArticleView").show()    
            }
            if (type == "event") {
                $('#RawEventView').show()
                $("#ArticleView").hide()    
            }
        }

        $("label[for='article']").click(() => {
            $("input[value='article']").prop("checked", true)
            SwitchView()
        })
        $("label[for='event']").click(() => {
            $("input[value='event']").prop("checked", true)
            SwitchView()
        })

        $("input[name='ViewType']").change(SwitchView)

        this.showRawEvent($('#RawEventView').get(0))
    }

    async load(addr : string) : Promise<NDKEvent|Error|string|null> {
        const [err, wikiEvent] = await safeAsync(this.fetchEvent(addr));
        if (!this.isCurrent())  return null
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

    async handle(addr: string) {
        this.clearUI()
        const ret = await this.load(addr)
        if (ret instanceof NDKEvent) {
            this.setEvent(ret)
            await this.show()
        } else {
            if (ret instanceof Error) {
                this.error(ret.message)
            }
            if (typeof(ret) == "string") {
                this.error(ret)
            }
        }
    }

    setup() {
        this.onRoute("/:id", (match) => {
            this.setCurrent()
            const addr = match.data.id
            this.handle(addr)
        })
    }
}
