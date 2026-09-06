
import $ from "jquery"

import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";

import { createJSONEditor, createKeySelection } from "vanilla-jsoneditor";

import { convert as ADConvert, Document as ADDocument } from '@asciidoctor/core';
import { parse as DjotParse, renderHTML as DJotRenderHTML } from '@djot/djot';

import { formatNip54TagD } from "./various.js";
import { UI } from "./UI.js";

import ArticleViewHTML from './Article.html?raw';

export class ArticleView {
    event: NDKEvent|null = null
    ui : UI

    constructor(ui : UI) {
        this.ui = ui
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
                node.text(node.attr("id"))
                node.attr("href", `/articles?id=${formatNip54TagD(node.attr("id"))}`)
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
                node.attr("href", `/articles?id=${formatNip54TagD(node.text())}`)
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
    
    async showContent(format: string|undefined ) {
        $("#ArticleContentView").html("")
        $("#ArticleContentView").append(await this.createNode(format))
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

        const o = $(ArticleViewHTML)
        o.find("h1 a").text(this.event.tagValue("title")).attr("href", `/articles?id=${this.event.tagValue("d")}`)
        o.find("#RawArticleContent").text(this.event.content)
    
        const user = await globalThis.piro.user.get(this.event.pubkey)
        if (user && user.profile) {
            o.find("img#AuthorPicture").attr("src", user.profile.picture)
            o.find("a#AuthorNick").text(user.profile.name).attr("href", `/articles?author=${user.pubkey}`)
        }
        o.find("#CreationTime").text(this.ui.time(this.event.created_at))
        o.find("a#ArticleId").text(this.event.tagValue("d")).attr("href", `/articles?id=${this.event.tagValue("d")}`)

        this.ui.mainView().append(o)

        $("#ContentTypeSelect").change((e) => {
            const fmt = $(e.currentTarget).val()
            this.showContent(fmt)
            console.log("Change content type:", fmt)
        })
    
        const select = $("#ContentTypeSelect")
        const format = this.event.tagValue("f")
        this.showContent(format)
        this.setFormatSelector(format)

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
}
