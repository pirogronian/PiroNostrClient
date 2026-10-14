
import $, { type JQuery } from "jquery"

import NDK, { NDKWiki, NDKDraft, NDKEvent, NDKUser, nip19 } from "@nostr-dev-kit/ndk";

import { convert as ADConvert, Document as ADDocument } from '@asciidoctor/core';
import { parse as DjotParse, renderHTML as DJotRenderHTML, type AstNode, type Doc } from '@djot/djot';

import { EditorView as CodeMirrorEditorView, basicSetup as CodeMirrorBasicSetup } from "codemirror";
import { EditorSelection as CodeMirrorEditorSelection } from "@codemirror/state";
import { undo as CodeMirrorUndo, redo as CodeMirrorRedo } from "@codemirror/commands";

const CodeMirror = {
    view: CodeMirrorEditorView,
    selection: CodeMirrorEditorSelection,
    basicSetup: CodeMirrorBasicSetup,
    undo: CodeMirrorUndo,
    redo: CodeMirrorRedo
}

import { Module } from "@/Module.js"
import { App } from "@/App.js"
import { safeAsync, formatNip54TagD, EventTagValues,
    FormattedTime, FormattedBytes, MakeLabelActive,
    CurrentTime, TimeToISO, TimeToUnix } from "@/various.js";

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
    useLastFormat: boolean = true
    editMode: boolean = false
    editorNode: JQuery<HTMLElement>|undefined
    draftId: string|undefined
    codeMirror?: CodeMirrorEditorView

    constructor() {
        super()
    }

    saveSettings() {
        this.settings(LAST_ARTICLE_FORMAT_KEY, this.lastFormat)
        this.settings(USE_LAST_ARTICLE_FORMAT_KEY, this.useLastFormat? "1": null)
    }

    restoreSettings() {
        let tmp = this.settings(LAST_ARTICLE_FORMAT_KEY)
        this.lastFormat = tmp ? tmp : ""
        tmp = this.settings(USE_LAST_ARTICLE_FORMAT_KEY)
        this.useLastFormat = tmp ? true : false
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

    showRawEvent() : void {
        const rawObject = this.event?.rawEvent();
        const jsonString = JSON.stringify(rawObject, null, 2);
        const view = $("#RawEventView")
        view.html(jsonString)
    }

    wikiBaseUrl(entry: string) {
        return `?id=${encodeURIComponent(formatNip54TagD(entry))}&followAuthor=${this.event?.pubkey}`
    }

    wikiUrl(entry: string) {
        return App.get().articles.innerUrl(this.wikiBaseUrl(entry))
    }

    makeLinkWiki(a: JQuery<HTMLElement>, entry: string, alias?: string) {
        if (!alias && !a.text()) alias = entry
        App.get().articles.makeLinkActive(a, this.wikiBaseUrl(entry), alias)
    }

    asciidocCreateWikilinks(element: JQuery<HTMLElement>) {
        element.find("a").each((index, node) => {
            //console.debug(node)
            node = $(node)
            //console.log("Checking node:", $(this).prop("nodeName"))
            //console.log("Checking node:", node)
            if (!node.text() && !node.attr("href")) {
                this.makeLinkWiki(node, node.attr("id"))
                //App.get().articles.makeLinkActive(node, 
                //    `?id=${formatNip54TagD(node.attr("id"))}&followAuthor=${this.event?.pubkey}`, `node.attr("id")`)
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

    djotCreateWikilinksAfter(element: JQuery<HTMLElement>) {
        element.find("a").each((index, node) => {
            //console.log("Checking node:", $(this).prop("nodeName"))
            //console.log("Checking node:", node)
            node = $(node)
            if (!node.attr("href")) {
                this.makeLinkWiki(node, node.text())
                //App.get().articles.makeLinkActive(node,
                //    `?id=${formatNip54TagD(node.text())}&followAuthor=${this.event?.pubkey}`)
                //node.attr("href", LocalUrl(`#/articles?id=${formatNip54TagD(node.text())}`))
            }
        })
    }

    astExtractText(node: any) {
        if (node.text)  return node.text
        if (node.children) {
            return node.children.map(this.astExtractText).join('')
        }
        return ""
    }

    astMakeWikilinks(node: any, root: any) {
        //console.debug("Parsing:", node)
        if (node.children) {
            for (let i = 0; i < node.children.length; i++) {
                this.astMakeWikilinks(node.children[i], root)
            }
        }

        if (node.tag == "link") {
            //console.debug("Got link.")
            if (!node.destination && node.reference) {
                const target = node.reference || this.astExtractText(node)
                if (!root.references[target]) {
                    //console.debug("Transforming unresolved link:", target)
                    node.destination = this.wikiBaseUrl(target)
                    node.reference = undefined
                    node.attributes = node.attributes || {}
                    node.attributes.class = "djot-wiki-todo"
                    //console.debug(node)
                }
            }
        }
    }

    djotMakeWikilinksActive(root: JQuery<HTMLElement>) {
        const links = root.find("a.djot-wiki-todo")
        links.each((index, link) => {
            link = $(link)
            App.get().articles.makeLinkActive(link, link.attr("href"))
        })
    }

    djot(content: string) : string {
        //content = this.djotCreateWikilinksBefore(content)
        const ast = DjotParse(content);
        this.astMakeWikilinks(ast, ast)
        return DJotRenderHTML(ast);
    }

    plaintext(content : string) : string {  return content}

    createWikiLinksFromTextNodes(container: HTMLElement): void {
        //const wikiLinkRegex = /\[\[([^\]|]+)(?:|([^\]]+))?\]\]/g;
        const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

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
                this.makeLinkWiki($(a), target, alias)
                //App.get().articles.makeLinkActive($(a),
                //    `?id=${encodeURIComponent(formatNip54TagD(target))}&followAuthor=${this.event?.pubkey}`, alias)
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

    createLinksFromWikiProtocol(container: JQuery<HTMLElement>) {
        const links = container.find("a")
        links.each((index, a) => {
            a = $(a)
            const href = a.prop("href")
            //console.debug(href, typeof href)
            if (href && href.startsWith("wiki:")) {
                //console.debug(a)
                const entry = href.slice(4)
                this.makeLinkWiki(a, entry)
                //App.get().articles.makeLinkActive(a, `?id=${encodeURIComponent(formatNip54TagD(entry))}&followAuthor=${this.event?.pubkey}`)
            }
        })
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
                this.createLinksFromWikiProtocol(ret)
                break
            case "djot":
                cnt = this.djot(content)
                ret = $(cnt)
                //this.djotCreateWikilinksAfter(ret)
                this.createWikiLinksFromTextNodes($("<div>").append(ret).get(0))
                this.djotMakeWikilinksActive(ret)
                this.createLinksFromWikiProtocol(ret)
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
                const cn = $("#ArticleContentView")
                cn.empty()
                cn.append(n)
                this.renderMath(cn.get(0))
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

    share() {
        if (!this.wiki) {
            console.warn("No Wiki to share!")
            return
        }
        if (this.editMode) {
            console.warn("Sharing not avaliable in edit mode!")
            return
        }
        const dialog = $("#ArticleShareDialog")
        const naddr = dialog.find("#ArticleNaddr")
        const nevent = dialog.find("#ArticleNevent")
        const url = dialog.find("#ArticleUrl")
        naddr.text(this.wiki.naddr)
        naddr.click(() => { navigator.clipboard.writeText(naddr.text()) })
        nevent.text(this.wiki.nevent)
        nevent.click(() => { navigator.clipboard.writeText(nevent.text()) })
        url.text(window.location.href)
        url.click(() => { navigator.clipboard.writeText(url.text()) })
        const close = dialog.find("#CloseShareArticleDialog")
        close.click(() => {
            dialog.prop("open", false)
        })
        dialog.prop("open", true)
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
                lDOM.append($("<div>").text(LangTools.humanFormat(lang.code)))
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

        const ulfl = $("#ArticleUseTheLastFormat")
        MakeLabelActive(ulfl)
        const ulf = ulfl.find("input")
        if (this.useLastFormat)  ulf.prop("checked", true)
        ulf.change(() => {
            //console.log("Checked")
            this.useLastFormat = ulf.prop("checked")
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

        const facheck = $("#ArticleFollowTheAuthor")
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
        
        const share = o.find("#ShareArticleButton")
        if (this.editMode)  share.hide()
        else share.click(() => { this.share() })

        this.guiUpdateEditButtons()
    }

//  EDIT STUFF  //

    guiUpdateRawEventEdit() {
        if (!this.wiki)  return
        const rawEventEdit = $("textarea#ArticleEditRawEvent")
        rawEventEdit.val(JSON.stringify(this.wiki.rawEvent(), null, 2))
    }

    applyRawEventEdit() {
        this.hideMessages()
        const rawEventEdit = $("textarea#ArticleEditRawEvent")
        const text = rawEventEdit.val().trim()
        if (!text)  return
        try {
            this.wiki = new NDKWiki(this.ndk, JSON.parse(text))
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

    guiCreateLangList() {
        const guiList = this.editorNode.find("#AllLanguagesList")
        const l = LangTools.getLangsList()
        l.forEach((lang) => {
            const label = `${lang}: ${LangTools.humanFormat(lang, lang)}`
            const option = $("<option>")
            option.prop("value", lang)
            option.text(label)
            guiList.append(option)
        })
    }

    guiAddLang(code:string) {
        const langs = this.editorNode.find("fieldset#Languages")
        const div = $("<div>")
        div.addClass("Item")
        div.addClass("Lang")
        div.attr("code", code)
        div.text(LangTools.humanFormat(code))
        langs.append(div)
    }

    guiClearLangs() {
        this.editorNode.find("fieldset#Languages").children().remove(".Item")
    }

    guiAddTag(tag: string[]) {
        const c = this.editorNode.find("fieldset#Tags")
        const div = $("<div>")
        div.addClass("Item")
        div.addClass("Tag")
        div.prop("title", "Click to remove.")
        div.click(() => { div.remove() })
        tag.forEach((item) => {
            const span = $("<span>")
            span.text(item)
            div.append(span)
        })
        c.append(div)
    }

    guiClearTags() {
        this.editorNode.find("fieldset#Tags").children().remove(".Item")
    }

    guiUpdateEditor() {
        if (!this.wiki)  return
        const en = this.editorNode
        en.find("input[name='ArticleTitle']").val(this.wiki.title)
        en.find("input[name='ArticleId']").val(this.wiki.dTag)
        en.find("input[name='ArticleFormat']").val(this.wiki.tagValue("f"))
        if (this.wiki.published_at)
            en.find("input[name='ArticlePublishedAt']").val(TimeToISO(this.wiki.published_at))
        en.find("textarea#ArticleSummary").val(this.wiki.summary)
        const cm = this.codeMirror
        if (cm) {
            //console.debug("Editor: insert wiki content.")
            cm.dispatch({
                changes: {
                    from: 0,
                    to: cm.state.doc.length,
                    insert: this.wiki.content
                }
            })
        }
        //en.find("textarea#ArticleContent").val(this.wiki.content)

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

        this.guiClearLangs()
        const le = CreateLangEvent(this.wiki)
        const ll = le.getLanguages()
        ll.forEach((lang) => {
            if (lang.code)  this.guiAddLang(lang.code)
        })

        this.guiClearTags()
        this.wiki.tags.forEach((tag) => {
            if (tag[0] && !(["d", "f", "c", "t", "title", "summary", "client", "published_at"].includes(tag[0]))) {
                if (tag[0] == "l" && tag[1]) {
                    const code = tag[1]
                    let standard = tag[2]
                    if (LangTools.isStandardName(standard) && LangTools.isValid(code, standard))  return
                }
                this.guiAddTag(tag)
            }
        })
        this.onFormatUpdate()
    }

    applyEditor() {
        this.wiki = new NDKWiki(this.ndk)
        this.wiki.kind = 30818
        const en = this.editorNode
        this.wiki.title = en.find("input[name='ArticleTitle']").val()
        this.wiki.dTag = en.find("input[name='ArticleId']").val()
        this.wiki.tags.push(["f", en.find("input[name='ArticleFormat']").val()])
        this.wiki.tags.push(["published_at", `${TimeToUnix(en.find("input[name='ArticlePublishedAt']").val())}`])
        this.wiki.summary = en.find("textarea#ArticleSummary").val()
        //this.wiki.content = en.find("textarea#ArticleContent").val()
        const content = this.codeMirror?.state.doc.toString()
        if (content)  this.wiki.content = content
        if (!this.wiki.tags)  return // To shut up editor warnings.
        const cats = en.find(".Category")
        cats.each((index, cat) => {
            this.wiki.tags.push(["c", $(cat).text()])
        })
        const topics = en.find(".Topic")
        topics.each((index, topic) => {
            this.wiki.tags.push(["t", $(topic).text()])
        })
        const langs = en.find(".Lang")
        const le = CreateLangEvent(this.wiki)
        langs.each((index, item) => {
            const code = $(item).attr("code")
            le.addLanguage(code, "bcp47")
        })
        const tags = en.find(".Tag")
        tags.each((index, tag) => {
            const fields = $(tag).children()
            let ntag: string[] = []
            fields.each((index, field) => {
                ntag.push($(field).text())
            })
            this.wiki?.tags.push(ntag)
        })
    }

    switchEditor(rawEvent: boolean) {
        console.debug("Switch raw event:", rawEvent)
        const edit = $("#ArticleEdit")
        const rawEdit = $("#ArticleEditRawEvent")
        if (rawEvent) {
            this.applyEditor()
            //console.debug(this.event)
            this.guiUpdateRawEventEdit()
            rawEdit.show()
            edit.hide()
        } else {
            this.applyRawEventEdit()
            //console.debug(this.event)
            this.guiUpdateEditor()
            rawEdit.hide()
            edit.show()
        }
    }

    isRawEdit(): boolean {
        const switcher = this.editorNode.find("#RawEventCheckbox")
        return switcher.prop("checked")
    }

    applyCurrent() {
        if (this.isRawEdit())  this.applyRawEventEdit()
        else this.applyEditor()
    }

    async draft(newId: boolean = false) {
        if (!this.editMode) {
            console.warn("Article.preview: not edit mode!")
            return
        }
        if (!this.wiki) {
            console.warn("No event to draft!")
            return
        }
        this.applyCurrent()
        const context = this.context
        const status = this.editorNode.find("#ArticleDraftStatus")
        const id = this.editorNode.find("input[name='ArticleId']").val()
        const time = CurrentTime()
        const draft = new NDKDraft(this.ndk)
        draft.event = this.wiki
        const user = this.ndk.activeUser
        //console.debug("Active user", user)
        await draft.encrypt(this.ndk.activeUser)
        if (!this.sameContext(context))
        console.debug("After encryption:", draft.identifier)

        if (!this.draftId || newId)  this.draftId = `wiki-${id}-${time}`
        draft.dTag = this.draftId
        console.debug("After id set:", draft.identifier)
        const p = draft.publishReplaceable()
        console.debug("After publishing:", draft.identifier)
        status.text("Saving...")
        p.then(() => {
            if (!this.sameContext(context))  return
            console.debug("After published:", draft.identifier)
            status.text(`Saved on ${FormattedTime(time)}`)
        }).catch((error) => {
            if (!this.sameContext(context))  return
            status.text(`Not saved!`)
            this.error(error)
        })
    }

    preview() {
        if (!this.editMode) {
            console.warn("Article.preview: not edit mode!")
            return
        }
        this.event = new NDKEvent(this.ndk, this.wiki?.rawEvent())
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
            this.applyCurrent()
            const relays = this.wiki?.publishReplaceable()
            relays?.then((set) => {
                const addr = nip19.naddrEncode(this.wiki)
                this.navigate(`/${addr}`)
            }, (set) => {
                this.notice("Event rejected!")
            })
        } catch (error) {
            this.error(error)
        }
    }

    onFormatUpdate() {
        const fmt = $("#ArticleFormat").val()
        const cmt = $("#CodeMirrorToolbar")
        const djot = cmt.find(".djot")
        const asciidoc = cmt.find(".asciidoc")
        djot.hide()
        asciidoc.hide()
        if (fmt == "djot") djot.show()
        if (fmt == "asciidoc") asciidoc.show()
    }

    setContentOnly(set: boolean) {
        const s = $("#ArticleEditTagStuff")
        const h = $("#ArticleEditContentHeading")
        if (set) {
            s.hide()
            h.hide()
        } else {
            s.show()
            h.show()
        }
    }

    CMSelected(): string {
        const view = this.codeMirror
        if (!view)  {
            console.warn("No CodeMirror editor present!")
            return ""
        }
        const { from, to } = view.state.selection.main;
        return view.state.sliceDoc(from, to);
    }

    CMInsert(text: string) {
        const view = this.codeMirror
        if (!view)  {
            console.warn("No CodeMirror editor present!")
            return
        }
        view.dispatch(view.state.replaceSelection(text))
        view.focus()
    }

    CMWrapSelection(prefix: string, suffix?: string) {
        const view = this.codeMirror
        if (!view)  {
            console.warn("No CodeMirror editor present!")
            return
        }
        if (suffix == undefined) suffix = prefix
        const trans = view.state.changeByRange(range => {
            const selected = view.state.sliceDoc(range.from, range.to)
            return {
                changes: {
                    from: range.from,
                    to: range.to,
                    insert: prefix + selected + suffix
                },
                range: CodeMirror.selection.range(
                        range.from + prefix.length,
                        range.to + prefix.length
                    )
            };
        })
        view.dispatch(trans)
        view.focus()
    }

    CMWrapLines(prefix: string, suffix?: string, strict: boolean = true) {
        const view = this.codeMirror
        if (!view)  {
            console.warn("No CodeMirror editor present!")
            return
        }
        if (suffix == undefined) suffix = prefix

        const trans = view.state.changeByRange(range => {
            const first = view.state.doc.lineAt(range.from)
            const last = view.state.doc.lineAt(range.to)

            const modified: string[] = []

            let begin: number, end: number
            for (let i = first.number; i <= last.number; i++) {
                begin = 0
                end = 0
                const line = view.state.doc.line(i)
                if (strict && line.number == first.number) {
                    begin = range.from - line.from
                    //console.debug("First line, begin = ", range.from, line.from)
                }
                if (strict && line.number == last.number) {
                    //console.debug("End line:", line.to, range.to)
                    end = line.to - range.to
                }
                const text = line.text.slice(begin, line.text.length - end)
                modified.push(prefix + text + suffix)
            }

            const repl = modified.join("\n")
            const from = (strict? range.from : first.from) + prefix.length
            const to = from + repl.length - suffix.length - (strict? end : 0)

            return {
                changes: {
                    from: strict? range.from : first.from,
                    to: strict? range.to : last.to,
                    insert: repl
                },
                range: CodeMirror.selection.range(from, to)
            }
        })

        view.dispatch(trans)
        view.focus()
    }

    CMWrapBlock(prefix: string, suffix?: string) {
        const view = this.codeMirror
        if (!view)  {
            console.warn("No CodeMirror editor present!")
            return
        }
        if (suffix == undefined) suffix = prefix

        const trans = view.state.changeByRange(range => {
            const first = view.state.doc.lineAt(range.from)
            const last = view.state.doc.lineAt(range.to)

            const modified: string[] = []

            for (let i = first.number; i <= last.number; i++) {
                const line = view.state.doc.line(i)
                modified.push()
            }

            const repl = prefix + modified.join("\n") + suffix

            const to = first.from + repl.length

            return {
                changes: {
                    from: first.from,
                    to: last.to,
                    insert: repl
                },
                range: CodeMirror.selection.range(first.from, to)
            }
        })

        view.dispatch(trans)
        view.focus()
    }

    CMDjotVerb() {
        this.CMWrapSelection("```")
    }

    CMDjotEmph() {
        this.CMWrapSelection("{_", "_}")
    }

    CMDjotStrong() {
        this.CMWrapSelection("{*", "*}")
    }

    CMDjotHigh() {
        this.CMWrapSelection("{=", "=}")
    }

    CMDjotSup() {
        this.CMWrapSelection("{^", "^}")
    }

    CMDjotSub() {
        this.CMWrapSelection("{~", "~}")
    }

    CMDjotIns() {
        this.CMWrapSelection("{+", "+}")
    }

    CMDjotDel() {
        this.CMWrapSelection("{-", "-}")
    }

    CMDjotQ1() {
        this.CMWrapSelection("{'", "'}")
    }

    CMDjotQ2() {
        this.CMWrapSelection("{\"", "\"}")
    }

    CMDjotEllipse() {
        this.CMInsert("...")
    }

    CMDjotNDash() {
        this.CMInsert("--")
    }

    CMDjotMDash() {
        this.CMInsert("---")
    }

    CMDjotMath() {
        this.CMWrapSelection("$`", "`")
    }

    CMDjotMathBlock() {
        this.CMWrapSelection("$$` ", " `")
    }

    CMDjotFootnRef() {
        this.CMWrapSelection("[^", "]")
    }

    CMDjotFootn() {
        this.CMWrapSelection("[^", "]:")
    }

    CMDjotBreak() {
        this.CMInsert("\\\n")
    }

    CMDjotLink(label: string, target: string) {
        this.CMInsert("["+label+"]")
        this.CMInsert("("+target+")")
    }

    CMDjotImage(label: string, target: string) {
        this.CMInsert("!["+label+"]")
        this.CMInsert("("+target+")")
    }

    CMDjotHeading(level: number) {
        if (level > 0 && level < 7) {
            const prefix = "#".repeat(level) + " "
            this.CMWrapLines(prefix, "", false)
        }
    }

    CMDjotBlQuote() {
        this.CMWrapLines("> ", "")
    }

    codeMirrorSetup() {
        const c = $("#CodeMirrorContainer")
        const view = new CodeMirror.view({
            parent: c.get(0),
            extensions: [
                CodeMirror.basicSetup,
                CodeMirrorEditorView.lineWrapping
            ]
        })
        $("#CodeMirrorUndoButton").click(() => {
            CodeMirror.undo(view)
            view.focus()
        })
        $("#CodeMirrorRedoButton").click(() => {
            CodeMirror.redo(view)
            view.focus()
        })
        $("#CodeMirrorDjotVerb").click(() => {
            this.CMDjotVerb()
        })
        $("#CodeMirrorDjotEmph").click(() => {
            this.CMDjotEmph()
        })
        $("#CodeMirrorDjotStrong").click(() => {
            this.CMDjotStrong()
        })
        $("#CodeMirrorDjotHigh").click(() => {
            this.CMDjotHigh()
        })
        $("#CodeMirrorDjotSup").click(() => {
            this.CMDjotSup()
        })
        $("#CodeMirrorDjotSub").click(() => {
            this.CMDjotSub()
        })
        $("#CodeMirrorDjotIns").click(() => {
            this.CMDjotIns()
        })
        $("#CodeMirrorDjotDel").click(() => {
            this.CMDjotDel()
        })
        $("#CodeMirrorDjotQ1").click(() => {
            this.CMDjotQ1()
        })
        $("#CodeMirrorDjotQ2").click(() => {
            this.CMDjotQ2()
        })
        $("#CodeMirrorDjotEllipse").click(() => {
            this.CMDjotEllipse()
        })
        $("#CodeMirrorDjotNDash").click(() => {
            this.CMDjotNDash()
        })
        $("#CodeMirrorDjotMDash").click(() => {
            this.CMDjotMDash()
        })
        $("#CodeMirrorDjotMath").click(() => {
            this.CMDjotMath()
        })
        $("#CodeMirrorDjotMathBlock").click(() => {
            this.CMDjotMathBlock()
        })
        $("#CodeMirrorDjotFootnRef").click(() => {
            this.CMDjotFootnRef()
        })
        $("#CodeMirrorDjotFootn").click(() => {
            this.CMDjotFootn()
        })
        $("#CodeMirrorDjotBreak").click(() => {
            this.CMDjotBreak()
        })
        {
            const b = $("#CodeMirrorDjotLink")
            const d = $("#CodeMirrorDjotLinkDialog")
            const l = $("#CodeMirrorDjotLinkDialogLabel")
            const t = $("#CodeMirrorDjotLinkDialogTarget")
            const c = $("#CodeMirrorDjotLinkDialogCancel")
            const i = $("#CodeMirrorDjotLinkDialogInsert")
            b.click(() => {
                const text = this.CMSelected()
                l.val(text)
                t.val(text)
                d.prop("open", true)
            })
            c.click(() => {
                d.prop("open", false)
            })
            i.click(() => {
                const label = l.val()
                const target = t.val()
                if (label && target) {
                    this.CMDjotLink(label, target)
                    d.prop("open", false)
                }
            })
        }
        {
            const b = $("#CodeMirrorDjotImage")
            const d = $("#CodeMirrorDjotImageDialog")
            const l = $("#CodeMirrorDjotImageDialogLabel")
            const t = $("#CodeMirrorDjotImageDialogTarget")
            const c = $("#CodeMirrorDjotImageDialogCancel")
            const i = $("#CodeMirrorDjotImageDialogInsert")
            b.click(() => {
                const text = this.CMSelected()
                l.val(text)
                t.val(text)
                d.prop("open", true)
            })
            c.click(() => {
                d.prop("open", false)
            })
            i.click(() => {
                const label = l.val()
                const target = t.val()
                if (target) {
                    this.CMDjotImage(label, target)
                    d.prop("open", false)
                }
            })
        }
        {
            const s = $("#CodeMirrorDjotHeading")
            s.change(() => {
                this.CMDjotHeading(Number(s.val()))
                s.val("Heading")
            })
        }
        $("#CodeMirrorDjotBlQuote").click(() => {
            this.CMDjotBlQuote()
        })

        this.codeMirror = view
    }

    async setupEditors(id: string|undefined = undefined) {
        this.editorNode = $(ArticleEditHTML)
        const en = this.editorNode
        const draftButt = en.find("button#ArticleDraftButton")
        const draftNewButt = en.find("button#ArticleDraftNewButton")
        const draftStatus = en.find("span#ArticleDraftStatus")
        const prevButt = en.find("button#ArticlePreviewButton")
        const pubButt = en.find("button#ArticlePublishButton")
        const switchEdit = en.find("input#RawEventCheckbox")
        const rawEventEdit = en.find("textarea#ArticleEditRawEvent")

        if (!this.event && id)
            en.find("input[name='ArticleId']").val(id)

        const fmt = en.find("input[name='ArticleFormat']")
        const fmtSel = en.find("select[name='ArticleFormatSelect']")
        fmtSel.change(() => {
            const format = fmtSel.val()
            console.debug("Set format to", format)
            fmt.val(format)
            this.onFormatUpdate()
        })
        
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

        this.guiCreateLangList()

        const langI = en.find("input[name='ArticleLanguage']")
        const addLangB = en.find("label[for='ArticleLanguage'] button")
        addLangB.click(() => {
            this.guiAddLang(langI.val())
        })

        const tagF = en.find("fieldset#NewTag")
        const newFieldB = en.find("#AddTagFieldButton")
        const remFieldB = en.find("#RemoveTagFieldButton")
        const newTagB = en.find("#AddTagButton")
        const tagFields = tagF.find("span")

        newFieldB.click(() => {
            const input = $("<input>")
            input.prop("type", "text")
            tagFields.append(input)
        })

        remFieldB.click(() => {
            //console.debug("Remove last:", tagFields.children().last("input"))
            tagFields.children().last("input").remove()
        })

        newTagB.click(() => {
            const fields = tagFields.children()
            let tag: string[] = []
            fields.each((index, field) => {
                //console.debug(field)
                tag.push($(field).val())
            })
            this.guiAddTag(tag)
        })

        draftButt.click(() => {
            this.draft()
        })

        draftNewButt.click(() => {
            this.draft(true)
        })

        prevButt.click(() => {
            try {
                //console.debug("Preview clicked.")
                this.hideMessages()
                const raw = switchEdit.prop("checked")
                if (raw)  this.applyRawEventEdit()
                else this.applyEditor()
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

        {
            const c = en.find("#ArticleEditContentCheckbox")
            c.change(() => {
                this.setContentOnly(c.prop("checked"))
            })
        }

        {
            const c = en.find("#ArticleEditToolbarCheckbox")
            const t = en.find("#CodeMirrorToolbar")
            c.change(() => {
                if (c.prop("checked"))  t.hide()
                else t.show()
            })
        }

        this.mainView(en)
        this.codeMirrorSetup()
        this.onFormatUpdate()

        this.guiUpdateEditor()
        this.guiUpdateRawEventEdit()
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

    async onEvent(event: NDKEvent) {
        if (!this.isCurrent())  return
        if (!this.event ||
            (this.event && 
            this.event.created_at &&
            event.created_at &&
            this.event.created_at < event.created_at)) {
            this.newContext()
            const context = this.context
            this.clearUI()
            if (this.editMode) {
                if (event.kind == NDKDraft.kind) {
                    //console.debug("Got draft!")
                    const draft = NDKDraft.from(event)
                    //console.debug("Applied to NDKDraft.")
                    const e = await draft.getEvent()
                    //console.debug("Event from draft:", e)
                    if (!this.sameContext(context)) {
                        //console.warn("Context changed, breaking...")
                        return
                    }
                    if (e) {
                        if (e.kind == NDKWiki.kind) {
                            this.draftId = draft.identifier
                            this.setEvent(e)
                        }
                        else this.error(`Wrong event kind: ${e.kind}!`)
                    }
                    else {
                        this.error("No event in draft!")
                    }
                }
                this.setupEditors()
            } else {
                this.setEvent(event)
                this.show()
            }
        }
    }

    async view(addr: string) {
        this.event = null
        this.wiki = null
        this.editMode = false
        
        this.subscribeForEvents(addr, { closeOnEose: true },
            { onEvent: (event) => {
                //console.debug("Article: got event:", event)
                this.onEvent(event)
            }
        })
    }

    async edit(data:string|object) {
        this.editMode = true
        this.draftId = undefined
        const context = this.context
        if (typeof data == "string") {
            this.event = null
            this.wiki = null
            //console.debug("Subscribing for event:", data)
            this.subscribeForEvents(data, { closeOnEose: true },
            { onEvent: (event) => {
                //console.debug("Article: got event:", event)
                this.onEvent(event)
            }})
            return
        }
        const my = await this.isMine()
        if (!this.sameContext(context))  return
        if (my ===  false) {
            this.wiki?.tag(this.event)
        }
        this.clearUI()
        if (data && typeof data == "object") {
            if (data.new) {
                this.event = null
                this.wiki = null
            }
            this.setupEditors(data.id)
        }
        else this.setupEditors()
    }

    setup() {
        this.onRoute("/edit/:id", (match) => {
            this.setCurrent()
            this.edit(match.data.id)
        })
        this.onRoute("/edit/", (match) => {
            this.setCurrent()
            this.edit(match.params)
        })
        this.onRoute("/:id", (match) => {
            this.setCurrent()
            const addr = match.data.id
            this.view(addr)
        })
        App.get().user.on("login", () => { this.guiUpdateEditButtons() })
        App.get().user.on("logout", () => { this.guiUpdateEditButtons() })
    }
}
