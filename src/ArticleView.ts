
import $ from "jquery"

import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";

import { createJSONEditor, createKeySelection } from "vanilla-jsoneditor";

import { convert as ADConvert, Document as ADDocument } from '@asciidoctor/core';
import { parse as DjotParse, renderHTML as DJotRenderHTML } from '@djot/djot';

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

    async asciidoc(content : string) : Promise<string|ADDocument> {
        return await ADConvert(content, {
            safe: 'secure', // Bezpieczne parsowanie (odrzuca potencjalnie groźne skrypty)
            attributes: {
                showtitle: true // Pokazuje główny tytuł artykułu w wygenerowanym HTML
            }
        });
    }

    djot(content: string) : string {
        const ast = DjotParse(content);
        return DJotRenderHTML(ast);
    }

    plaintext(content : string) : string {  return content}

    async render(format: string|null = null) {
        if (!this.event) return;
        let cnt: string|ADDocument = ""
        const av = $("#ArticleView")
        switch(format) {
            case "asciidoc":
                cnt = await this.asciidoc(this.event.content)
                av.html(cnt)
                break
            case "djot":
                cnt = this.djot(this.event.content)
                av.html(cnt)
                break
            default:
                cnt = this.plaintext(this.event.content)
                av.html(cnt)
        }
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

    show() {
        if (!this.event) return
        this.ui.mainView().html(ArticleViewHTML)
        $("h1").text(this.event.tagValue("title"))
        $("#RawArticleContent").text(this.event.content)
    
        $("#ContentTypeSelect").change((e) => {
            const fmt = $(e.currentTarget).val()
            this.render(fmt)
            console.log("Change content type:", fmt)
        })
    
        const select = $("#ContentTypeSelect")
        const format = this.event.tagValue("f")
        this.render(format)
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
