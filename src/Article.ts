
import $ from "jquery"

import NDK, { NDKWiki, NDKEvent, nip19 } from "@nostr-dev-kit/ndk";

import { convert as ADConvert, Document as ADDocument } from '@asciidoctor/core';
import { parse as DjotParse, renderHTML as DJotRenderHTML } from '@djot/djot';

import { Module } from "@/Module.js"
import { App } from "@/App.js"
import { safeAsync, formatNip54TagD, EventTagValues, FormattedTime, FormattedBytes, MakeLabelActive } from "@/various.js";

import { LangTools } from "./LangTools.js";
import { CreateLangEvent } from "./LangEvent.js";

import ArticleViewHTML from '@/Article.html?raw';
import ArticleInfoHTML from "@/ArticleInfo.html?raw"
import ArticleEditHTML from "@/ArticleEdit.html?raw"

import "@/Article.scss"

const LAST_ARTICLE_FORMAT_KEY = "last_format"
const USE_LAST_ARTICLE_FORMAT_KEY = "use_last_format"

export class Article extends Module {
    event: NDKEvent|null = null
    wiki: NDKWiki|null = null
    lastFormat: string = ""
    useLastFormat: string = "1"
    editMode: boolean = false
    editorNode: JQuery<HTMLElement>|undefined

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

    async isMine(): Promise<boolean|undefined> {
        if (!this.event)  return false
        const user = await App.get().user.get()
        if (!user)  return undefined
        return this.event.pubkey == user.pubkey
    }

    showRawEvent(target) : void {
        const rawObject = this.event?.rawEvent();
        const jsonString = JSON.stringify(rawObject, null, 2);
        const view = $("#RawEventView")
        view.html(jsonString)
    }

    asciidocCreateWikilinks(element) {
        element.find("a").each(() => {
            const node = $(this)
            //console.log("Checking node:", $(this).prop("nodeName"))
            //console.log("Checking node:", node)
            if (!node.text() && !node.attr("href")) {
                App.get().articles.makeLinkActive(node, 
                    `?id=${formatNip54TagD(node.attr("id"))}&followAuthor=${this.event?.pubkey}`, node.attr("id"))
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
        element.find("a").each((node) => {
            //console.log("Checking node:", $(this).prop("nodeName"))
            //console.log("Checking node:", node)
            if (!node.attr("href")) {
                App.get().articles.makeLinkActive(node,
                    `?id=${formatNip54TagD(node.text())}&followAuthor=${this.event?.pubkey}`)
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
                App.get().articles.makeLinkActive($(a),
                    `?id=${encodeURIComponent(formatNip54TagD(target))}&followAuthor=${this.event?.pubkey}`, alias)
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

    async guiUpdateEditButtons() {
        console.debug("Edit buttons update.")
        if (this.editMode)  return
        const context = this.context
        const forkButton = $("#ForkArticleButton")
        const editButton = $("#EditArticleButton")
        const my = await this.isMine()
        if (!this.sameContext(context))  return
        if (my !== undefined) {
            if (my) {
                forkButton.hide()
                editButton.show()
            }
            else {
                forkButton.show()
                editButton.hide()
            }
        } else { console.warn("No user, no edit.") }
    }

    async show(container = this.mainView()) {
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
        const cats = EventTagValues(this.event, "c")

        const client = this.event.tagValue("client")

        const info = $(ArticleInfoHTML)
        const titlekDOM = info.find("dt#Title")
        const titleDOM = info.find("dd#Title")
        if (this.wiki.title) titleDOM.text(this.wiki.title)
        else {
            titlekDOM.remove()
            titleDOM.remove()
        }

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
        App.get().user.makeLinkActive(nickDOM, `/${this.wiki.pubkey}`, nick2)

        const lDOM = info.find("#ArticleLangs")
        const le = CreateLangEvent(this.event)
        const langs = le.getLanguages()
        if (langs.length > 0) {
            langs.forEach((lang) => {
                if (!lang.code) return
                lDOM.append($("<div>").text(LangTools.humanFormat(lang.code, lang.standard)))
            })
        } else lDOM.parent().hide()

        info.find("#ArticlePublishedAt").text(FormattedTime(this.wiki.published_at))
        info.find("#EventCreatedAt").text(FormattedTime(this.wiki.created_at))

        const sumDOM = info.find("#ArticleSummary")
        if (summary)  sumDOM.text(summary)
        else sumDOM.parent().hide()

        const originDOM = info.find("#OriginLink")
        if (origin)  this.makeLinkActive(originDOM, `/${origin}`)
        else originDOM.parent().hide()

        const catsDOM = info.find("#ArticleCategories")
        cats.forEach((cat) => {
            const a = $(App.get().articles.activeLink(`?c=${cat}"`, cat))
            catsDOM.append(a)
        })
        if (!cats.length)
            catsDOM.parent().hide()

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

        container.append(o)

        container.find("#ArticleInfo").append(info)

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

        const facheck = $("label[for='FollowAuthor']")
        MakeLabelActive(facheck)
        const facheckinp = facheck.find("input")
        const arts = App.get().articles
        facheckinp.prop("checked", arts.followAuthor)
        facheckinp.change(() => {
            //console.debug("Switch follow author to", facheckinp.prop("checked"))
            arts.followAuthor = facheckinp.prop("checked")
            arts.saveSettings()
        })

        o.find("#ForkArticleButton").click(() => { this.navigate("/edit/") })
        o.find("#EditArticleButton").click(() => { this.navigate("/edit/") })

        this.guiUpdateEditButtons()
    }

    guiUpdateRawEventEdit() {
        if (!this.event)  return
        const rawEventEdit = $("textarea#ArticleEditRawEvent")
        rawEventEdit.val(JSON.stringify(this.event.rawEvent(), null, 2))
    }

    applyRawEventEdit() {
        this.hideMessages()
        const rawEventEdit = $("textarea#ArticleEditRawEvent")
        const text = rawEventEdit.val().trim()
        if (!text)  return
        try {
            this.event = new NDKEvent(this.ndk, JSON.parse(text))
        } catch (error) {
            this.error(error)
        }
    }

    guiAddTopic(topic: string) {
        const topicC = this.editorNode.find("fieldset#Topics")
        const item = $("<div>")
        item.addClass("Topic")
        item.addClass("Item")
        item.text(topic)
        item.prop("title", "Click to remove.")
        item.click(() => { item.remove() })
        topicC.append(item)
    }

    guiClearTopics() {
        this.editorNode.find("fieldset#Topics").children().remove(".Item")
    }

    guiAddCategory(cat: string) {
        const catC = this.editorNode.find("fieldset#Categories")
        const item = $("<div>")
        item.addClass("Category")
        item.addClass("Item")
        item.text(cat)
        item.prop("title", "Click to remove.")
        item.click(() => { item.remove() })
        catC.append(item)
    }

    guiClearCategories() {
        this.editorNode.find("fieldset#Categories").children().remove(".Item")
    }

    guiUpdateEditor() {
        if (!this.wiki)  return
        const en = this.editorNode
        en.find("input[name='ArticleTitle']").val(this.wiki.title)
        en.find("input[name='ArticleId']").val(this.wiki.dTag)
        en.find("textarea#ArticleSummary").val(this.wiki.summary)
        en.find("textarea#ArticleContent").val(this.wiki.content)
        this.guiClearCategories()
        const cats = this.wiki.getMatchingTags("c")
        cats.forEach((tag) => {
            if (tag[1])  this.guiAddCategory(tag[1])
        })
        this.guiClearTopics()
        const topics = this.wiki.getMatchingTags("t")
        topics.forEach((tag) => {
            if (tag[1])  this.guiAddTopic(tag[1])
        })
    }

    switchEditor(rawEvent: boolean) {
        console.debug("Switch raw event:", rawEvent)
        const edit = $("#ArticleEdit")
        const rawEdit = $("#ArticleEditRawEvent")
        if (rawEvent) {
            this.guiUpdateRawEventEdit()
            rawEdit.show()
            edit.hide()
        } else {
            this.applyRawEventEdit()
            this.guiUpdateEditor()
            rawEdit.hide()
            edit.show()
        }
    }

    preview() {
        if (!this.editMode) {
            console.warn("Article.preview: not edit mode!")
            return
        }
        console.debug("Making preview of a Wiki event...")
        const preview = $("#ArticlePreview")
        preview.empty()
        this.show(preview)
    }

    publish() {
        if (!this.editMode) {
            console.warn("Article.publish: not edit mode!")
            return
        }
        try {
            console.debug("Trying to publish a Wiki event...")
            this.hideMessages()
            const relays = this.event?.publishReplaceable()
            relays?.then((set) => {
                const addr = nip19.naddrEncode(this.event)
                this.navigate(`/${addr}`)
            }, (set) => {
                this.notice("Event rejected!")
            })
        } catch (error) {
            this.error(error)
        }
    }

    edit() {
        this.editMode = true
        const context = this.context
        this.clearUI()
        this.editorNode = $(ArticleEditHTML)
        const en = this.editorNode
        const prevButt = en.find("button#ArticlePreviewButton")
        const pubButt = en.find("button#ArticlePublishButton")
        const switchEdit = en.find("input#RawEventCheckbox")
        const rawEventEdit = en.find("textarea#ArticleEditRawEvent")

        //console.debug(prevButt)
        //console.debug(pubButt)
        const topicL = en.find("label[for='ArticleTopic']")
        const topicI = topicL.find("input")
        const topicB = topicL.find("button")
        const topicC = en.find("fieldset#Topics")
        topicB.click(() => {
            const topic = topicI.val()
            if (!topic)  return
            this.guiAddTopic(topic)
        })

        const catL = en.find("label[for='ArticleCategory']")
        const catI = catL.find("input")
        const catB = catL.find("button")
        const catC = en.find("fieldset#Categories")
        catB.click(() => {
            const cat = catI.val()
            if (!cat)  return
            this.guiAddCategory(cat)
        })

        prevButt.click(() => {
            try {
                //console.debug("Preview clicked.")
                this.hideMessages()
                this.event = new NDKEvent(this.ndk, JSON.parse(rawEventEdit.val()))
                this.preview()
            } catch (error) {
                this.error(error)
            }
        })

        pubButt.click(() => {
            this.publish()
        })

        MakeLabelActive(switchEdit.parent())
        switchEdit.change(() => {
            this.switchEditor(switchEdit.prop("checked"))
        })

        this.guiUpdateEditor()
        this.guiUpdateRawEventEdit()

        this.mainView(en)
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
        this.editMode = false
        
        this.subscribe(addr, { closeOnEose: true },
            { onEvent: (event) => {
                //console.debug("Article: got event:", event)
                this.onEvent(event)
            }
        })
    }

    setup() {
        this.onRoute("/edit/", () => {
            this.setCurrent()
            this.edit()
        })
        this.onRoute("/:id", (match) => {
            this.setCurrent()
            const addr = match.data.id
            this.handle(addr)
        })
        App.get().user.on("login", () => { this.guiUpdateEditButtons() })
        App.get().user.on("logout", () => { this.guiUpdateEditButtons() })
    }
}
