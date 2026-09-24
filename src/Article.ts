
import $ from "jquery"

import NDK, { NDKWiki, NDKEvent } from "@nostr-dev-kit/ndk";

import { createJSONEditor, createKeySelection } from "vanilla-jsoneditor";

import { convert as ADConvert, Document as ADDocument } from '@asciidoctor/core';
import { parse as DjotParse, renderHTML as DJotRenderHTML } from '@djot/djot';

import { Module } from "@/Module.js"
import { App } from "@/App.js"
import { safeAsync, formatNip54TagD, EventTagValues, FormattedTime, FormattedBytes } from "@/various.js";

import ArticleViewHTML from '@/Article.html?raw';
import ArticleInfoHTML from "@/ArticleInfo.html?raw"

import "@/Article.scss"

const LAST_ARTICLE_FORMAT_KEY = "last_format"
const USE_LAST_ARTICLE_FORMAT_KEY = "use_last_format"

export class Article extends Module {
    event: NDKEvent|null = null
    wiki: NDKWiki|null = null
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
        this.event.on("relay:node", (relay) => {
            console.debug("Event on relay", relay.url)
            this.guiUpdateRelays()
        })
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

    guiUpdateRelays() {
        const relaysDOM = this.mainView().find("#ArticleRelays")
        relaysDOM.append($("<div>").text(this.event?.relay?.url))
        this.event.onRelays.forEach((relay) => {
            if (relay.url != this.event?.relay?.url)
                relaysDOM.append($("<div>").text(relay.url))
        })
    }

    async show() {
        const context = this.context
        if (!this.event || !this.wiki) {
            console.log("No event!")
            return
        }

        this.restoreSettings()

        const o = $(ArticleViewHTML)
    
        const user = await App.get().user.get(this.event.pubkey)
        if (!this.sameContext(context))  return
        
        let nick = user?.profile?.name
        if (!nick) nick = "author"
        const summary = this.wiki.summary

        let origin = this.event.tagValue("e")
        if (!origin) origin = this.event.tagValue("a")
        const oa = o.find("#OriginLink")

        const topics = EventTagValues(this.event, "t")

        const client = this.event.tagValue("client")

        const info = $(ArticleInfoHTML)
        const titleDOM = info.find("#Title")
        if (this.wiki.title)  titleDOM.text(this.wiki.title)
        else titleDOM.parent().parent().remove()

        const idDOM = info.find("#ArticleId")
        const id = this.wiki.dTag
        App.get().articles.makeLinkActive(idDOM, `?id=${id}`, id)

        const imgDOM = info.find("#ArticlePicture")
        if (this.wiki.image)  imgDOM.prop("src", this.wiki.image)
        else imgDOM.parent().parent().hide()

        const urlDOM = info.find("#ArticleUrl")
        if (this.wiki.url)  urlDOM.prop("href", this.wiki.url)
        else urlDOM.parent().parent().hide()

        const authPictDOM = info.find("#AuthorPicture")
        const picture = user?.profile?.picture
        if (picture)  authPictDOM.prop("src", picture)
        
        const nickDOM = info.find("#AuthorNick")
        const nick2 = user?.profile?.name ? user.profile.name : "[author]"
        App.get().articles.makeLinkActive(nickDOM, `?author=${this.wiki.pubkey}`, nick2)

        info.find("#ArticlePublishedAt").text(FormattedTime(this.wiki.published_at))
        info.find("#EventCreatedAt").text(FormattedTime(this.wiki.created_at))

        const sumDOM = info.find("#ArticleSummary")
        if (summary)  sumDOM.text(summary)
        else sumDOM.parent().hide()

        const originDOM = info.find("#OriginLink")
        if (origin)  this.makeLinkActive(originDOM, `/${origin}`)
        else originDOM.parent().hide()

        const topicsDOM = info.find("#ArticleTopics")
        topics.forEach((topic) => {
            const a = $(App.get().articles.activeLink(`?t=${topic}"`, topic))
            topicsDOM.append(a)
        })
        if (!topics.length)
            topicsDOM.parent().hide()

        const clientDOM = info.find("#ArticleClient")
        if (client)  clientDOM.text(client)
        else clientDOM.parent().hide()

        info.find("#EventSize").text(FormattedBytes(this.event.size(), 2))

        this.mainView(o)

        this.mainView().find("#ArticleInfo").append(info)

        this.guiUpdateRelays()

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

    onEvent(event: NDKEvent) {
        if (!this.isCurrent())  return
        if (!this.event ||
            (this.event && 
            this.event.created_at &&
            event.created_at &&
            this.event.created_at < event.created_at)) {
            this.newContext()
            this.setEvent(event)
            this.clearUI()
            this.show()
        }
    }

    async handle(addr: string) {
        this.event = null
        this.wiki = null
        /*this.clearUI()
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
        }*/
       this.subscribe(addr, { closeOnEose: true },
        { onEvent: (event) => {
            //console.debug("Article: got event:", event)
            this.onEvent(event)
        } })
    }

    setup() {
        this.onRoute("/:id", (match) => {
            this.setCurrent()
            const addr = match.data.id
            this.handle(addr)
        })
    }
}
