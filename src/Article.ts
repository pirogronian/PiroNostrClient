import $ from "jquery"

import { createJSONEditor, createKeySelection } from "vanilla-jsoneditor";

import { convert as ADConvert } from '@asciidoctor/core';
import { parse as DjotParse, renderHTML as DJotRenderHTML } from '@djot/djot';

import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";

import { safeAsync, ErrorMessage } from "./various.js";

import ArticleViewHTML from './Article.html?raw';

function ShowRawEvent(event : NDKEvent, target) : void {
    const rawObject = event.rawEvent();
  
    const jsonString = JSON.stringify(rawObject, null, 2);

    createJSONEditor({
        target: target,
        props: {
            content: { json: jsonString },
            readOnly: true, // tryb podglądu
            mode: 'tree'   // lub 'tree',
        }
    });
}

async function ShowAsciidoc(content : string) : void {
    const html = await ADConvert(content, {
        safe: 'secure', // Bezpieczne parsowanie (odrzuca potencjalnie groźne skrypty)
        attributes: {
            showtitle: true // Pokazuje główny tytuł artykułu w wygenerowanym HTML
        }
    });
    const el = document.getElementById('ArticleView')
    el.innerHTML = html
}

function ShowDjot(content: string) : void {
    const ast = DjotParse(content);
    const htmlOutput = DJotRenderHTML(ast);
    const el = document.getElementById('ArticleView')
    el.innerHTML = htmlOutput
}

function ShowPlaintext(content : string) : void {
    const el = document.getElementById('ArticleView')
    el.innerText = content
}

export function ShowArticle(event) {
    const MWHtml = document.getElementById('MainView');
    MWHtml.innerHTML = ArticleViewHTML

    document.getElementById("RawArticleContent").innerText = event.content

    const inputs = MWHtml?.querySelectorAll("#ContentTypeSelect");
    inputs?.forEach((input) => {
        input.addEventListener("change", function() {
            if (this.value == "asciidoc") {
                ShowAsciidoc(event.content)
            }
            if (this.value == "djot") {
                ShowDjot(event.content)
            }
            if (this.value == "plain") {
                ShowPlaintext(event.content)
            }
            console.log("Change content type:", this.value)
        })
    })

    const select = $("#ContentTypeSelect")
    const format = event.tagValue("f")
    switch (format) {
        case "asciidoc":
            select.val(format)
            ShowAsciidoc(event.content)
            break;
        case "djot":
            select.val(format)
            ShowDjot(event.content)
            break;
        default:
            select.val("plain")
            ShowPlaintext(event.content)
    }

    const RawEventElement = MWHtml?.querySelector('#RawEventView')
    ShowRawEvent(event, RawEventElement)
    const rev = document.getElementById('RawEventView')

    function toggle(event) {
        event.preventDefault()
        if (rev.style.display != 'none') {
            rev.style.display = 'none'
        } else {
            rev.style.display = 'block'
        }
    }

    document.getElementById("EventViewSwitch")?.addEventListener("click", toggle)
}

export async function LoadArticle(ndk : NDK, addr : string) : Promise<void> {
    const [err, wikiEvent] = await safeAsync(ndk.fetchEvent(addr));
    if (err) {
        ErrorMessage("Wrong address format!")
        console.log(`Error while parsing address ${addr}`)
        console.log(`Error message: ${err.message}`)
    } else {
        if (wikiEvent === null) {
            ErrorMessage("No event found!")
            console.log(`No event with address ${addr}`)
        } else {
            if (wikiEvent.kind == 30818) {
                ShowArticle(wikiEvent)
            } else {
                ErrorMessage(`Wrong kind of event (${wikiEvent.kind})`)
            }
        }
    }
}
