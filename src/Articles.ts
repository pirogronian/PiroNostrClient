
import $ from "jquery"
import NDK, { NDKEvent, NDKRelay } from "@nostr-dev-kit/ndk";
import type { NDKFilter, NDKSubscription } from "@nostr-dev-kit/ndk"

import { safeAsync, EventTagValues, FormattedTime } from "@/various.js";
import { Module } from "@/Module.js";
import { App } from "@/App.js"

import FinderHTML from "@/Finder.html?raw"
import FinderTagInputs from "@/FinderTagInputs.html?raw"
import ArtHeadHTML from "@/ArticleHeader.html?raw"

export class Articles extends Module {
    sub: NDKSubscription | null = null
    enabled: boolean = false

    async articleHead(event: NDKEvent, relay?: NDKRelay) : Promise<void> {
        //console.log("Article event:", event)
        if (!App.get().articles.enabled) return
        //console.log("Articles enabled")
        const Head = $(ArtHeadHTML)
        const title = Head.find(".ArticleTitle")
        let TT = event.tagValue("title")
        if (!TT) { TT = event.tagValue("d") }
        console.log(`Received article "${TT}"`)
        title.text(TT)
        App.get().article.makeLinkActive(title, `/${event.encode()}`)

        const user = await App.get().user.get(event.pubkey)
        if (user && user.profile) {
            this.makeLinkActive(Head.find("a.AuthorNick"), `?author=${user.pubkey}`, user.profile.name)
            Head.find("img.AuthorImg").attr("src", user.profile.picture)
            Head.find("div.CreationTime").text(FormattedTime(event.created_at))
        }

        Head.find("div.Summary").text(event.tagValue("summary"))
        const topics = EventTagValues(event, "t")
        const HeadTopics = Head.find(".Topics")
        topics.forEach((topic) => {
            const a = this.activeLink(`?t=${topic}`, topic)
            HeadTopics.append(a)
        })

        const fr = this.mainView().find("#FinderResult")
        fr.append(Head)
        $("#FinderResultsNumber").text(`Results: ${fr.children().length}`)

    }

    async finder() {
        const o = $(FinderHTML)
        this.mainView().append(o)
        const form = $("#FinderForm")
        form.prop("action", this.innerUrl(""))
        const me = form.find("button#FinderAuthorMe")
        const user = await App.get().user.get(null, false)
        if (user && user.pubkey) {
            const ai = form.find("input[name='author']")
            me.click(function() {
                ai.val(user.pubkey)
            })
        } else me.hide()
        const fft = form.find("#FinderFormTags")
        form.find("button#AddSearchTag").click(() => {
            const tag = form.find("input[name='tag']").val()
            const val = form.find("input[name='tagvalue']").val()
            if (!tag) return;
            const o = $(FinderTagInputs)
            o.find("input").attr("name", tag).val(val)
            o.find("label").attr("for", tag).text(`Tag "${tag}:"`)
            o.find("button").attr("data", tag)
            o.find("button").click(function() {
                $(this).parent().remove()
            })
            fft.append(o)
        })
        form.submit((e) => {
            e.preventDefault()
            const formData = new FormData(form.get(0));
            const searchParams = new URLSearchParams();
            for (const [key, value] of formData.entries()) {
                if (value) {
                    searchParams.append(key, value.toString());
                }
            }
            const url = searchParams.toString()
            App.get().router.navigate(`/articles?${url}`)
        })
        /*form.find("input").on("keydown", function(e){
            console.log("Pressed key in input:", e.key)
            if (e.key === "Enter")
                console.log("Enter pressed in input field.")
        })*/
    }

    isFinder(): boolean {
        return $("form#FinderForm").html()
    }

    clearFinderResult() {
        $("#FinderResult").empty()
    }

    load(params: object,
        onEvent: (event: NDKEvent, relay?: NDKRelay) => any)
    {
        this.enabled = true
        const filter: NDKFilter = {
            kinds: [30818]
            //'#d': [pageSlug]
        };
        if (params) {
            if (params.author) {
                console.log("Subscribing with author:", params.author)
                filter.authors = [ params.author ]
            }
            if (params.id) {
                console.log("Subscribing with id:", params.id)
                filter['#d'] = [ params.id ]
            }
            for (const [key, value] of Object.entries(params)) {
                if (key.length == 1) {
                    const tkey = `#${key}`
                    if (Array.isArray(value))
                        filter[`#${key}`] = value
                    else
                        filter[`#${key}`] = [ value ]
                }
            }
            if (params.since) {
                const since = params.since
                console.log("Filter.since:", since)
                const dobj = new Date(since)
                const dn = dobj.getTime() / 1000
                filter.since = dn
            }
            if (params.unitl) {
                const until = params.unitl
                console.log("Filter.until:", until)
                const dobj = new Date(until)
                const dn = dobj.getTime() / 1000
                filter.until = dn
            }
            if (params.limit) {
                const limit = Number(params.limit)
                console.log("Filter.limit:", limit)
                filter.limit = limit
            }
        }

        console.log("Subscribing for articles with filter", filter)
        
        try {
            this.sub = this.ndk.subscribe(
                filter,
                { closeOnEose : true },
                { onEvent: onEvent })
        } catch (e) {
            return e
        }
    }

    stop() {
        if (this.sub) {
            this.sub.stop()
        }
        this.enabled = false
    }

    handle(params: object) {
        //this.loadFinder(params.author, params.id)
        const err = this.load(params,
            (event: NDKEvent, relay?: NDKRelay) => {
                this.articleHead(event, relay)
            })
        if (err) {
            this.error(err.message)
        }
    }

    setup() {
        this.onRoute('', (match) => {
            console.log("Route: /articles")
            //console.log(match.params)
            if (this.isFinder()) {
                console.log("Is finder, clearing results.")
                this.clearFinderResult()
            }
            else {
                console.log("Clear main view, create finder.")
                this.clearUI()
                this.finder()
            }
            if (match?.params)
                this.handle(match?.params)
        })
    }
}
