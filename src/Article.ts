
import $ from "jquery"

import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";

import { createJSONEditor, createKeySelection } from "vanilla-jsoneditor";

import { convert as ADConvert, Document as ADDocument } from '@asciidoctor/core';
import { parse as DjotParse, renderHTML as DJotRenderHTML } from '@djot/djot';

import { Module } from "@/Module.js"
import { App } from "@/App.js"
import { safeAsync, formatNip54TagD, EventTagValues, FormattedTime } from "@/various.js";

import "@/style.scss"

import ArticleViewHTML from '@/Article.html?raw';

const LAST_ARTICLE_FORMAT_KEY = "last_format"
const USE_LAST_ARTICLE_FORMAT_KEY = "use_last_format"

export class Article extends Module {
    event: NDKEvent|null = null
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
    }

    showRawEvent(target) : void {
        const rawObject = this.event.rawEvent();
  
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
                break
            case "djot":
                cnt = this.djot(content)
                ret = $(cnt)
                this.djotCreateWikilinksAfter(ret)
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
            $("#ArticleContentView").html("")
            $("#ArticleContentView").append(n)
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
        if (!this.event) {
            console.log("No event!")
            return
        }

        this.restoreSettings()

        const o = $(ArticleViewHTML)
        App.get().articles.makeLinkActive(o.find("h1 a"), `?id=${this.event.tagValue("d")}`, this.event.tagValue("title"))
        //o.find("h1 a").text(this.event.tagValue("title")).attr("href", LocalUrl(`#/articles?id=${this.event.tagValue("d")}`))
        o.find("#RawArticleContent").text(this.event.content)
    
        const user = await App.get().user.get(this.event.pubkey)
        if (user && user.profile) {
            o.find("img#AuthorPicture").attr("src", user.profile.picture)
            App.get().articles.makeLinkActive(o.find("a#AuthorNick"), `?author=${user.pubkey}`, user.profile.name)
            //o.find("a#AuthorNick").text(user.profile.name).attr("href", LocalUrl(`#/articles?author=${user.pubkey}`))
        }
        o.find("#CreationTime").text(FormattedTime(this.event.created_at))
        App.get().articles.makeLinkActive(o.find("a#ArticleId"), `?id=${this.event.tagValue("d")}`, this.event.tagValue("d"))
        //o.find("a#ArticleId").text(this.event.tagValue("d")).attr("href", LocalUrl(`#/articles?id=${this.event.tagValue("d")}`))
        o.find("#ArticleSummary").text(this.event.tagValue("summary"))

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

        const co = o.find("#ArticleClient")
        const client = this.event.tagValue("client")
        if (client) co.text(`Created with: ${client}`)
        else co.hide()

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

    async load(addr : string) : Promise<NDKEvent|Error|string> {
        const [err, wikiEvent] = await safeAsync(this.ndk.fetchEvent(addr));
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
            this.show()
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
            App.get().current = "Article"
            const addr = match.data.id
            this.handle(addr)
        })
    }
}
