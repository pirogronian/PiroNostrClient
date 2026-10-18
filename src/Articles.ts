
import $ from "jquery"
import NDK, { NDKEvent, NDKWiki, NDKRelay } from "@nostr-dev-kit/ndk";
import type { NDKFilter, NDKSubscription, NDKSubscriptionOptions } from "@nostr-dev-kit/ndk"
import { NDKSync } from "@nostr-dev-kit/sync"
//import NDKCacheAdapterDexie, { db } from '@nostr-dev-kit/ndk-cache-dexie';

import { safeAsync, EventTagValues, FormattedTime, FormattedBytes, formatNip54TagD } from "@/various.js";
import { Module } from "@/Module.js";
import { App } from "@/App.js"

import FinderHTML from "@/Finder.html?raw"
import FinderTagInputs from "@/FinderTagInputs.html?raw"
import ArtHeadHTML from "@/ArticleHeader.html?raw"

import "@/Articles.scss"

const FOLLOW_AUTHOR_SETTING_KEY = "FollowAuthor"

function sortItems(item1:HTMLElement, item2:HTMLElement): number {
    const asc = $("#ArticlesOrderAsc").prop("checked")
    const field = $("#ArticlesOrderField").val()
    let field1
    let field2
    const jtem1 = $(item1)
    const jtem2 = $(item2)
    const event1 = new NDKWiki(undefined, JSON.parse(jtem1.attr("data")))
    const event2 = new NDKWiki(undefined, JSON.parse(jtem2.attr("data")))
    switch (field) {
        case "title":
            field1 = event1.title
            if (!field1) field1 = event1.dTag
            field2 = event2.title
            if (!field2) field2 = event2.dTag
            break
        case "content":
            field1 = event1.content
            field2 = event2.content
            break
        case "creationTime":
            field1 = event1.created_at
            field2 = event2.created_at
            break
        case "publicationTime":
            field1 = event1.published_at
            if (!field1) field1 = event1.created_at
            field2 = event2.published_at
            if (!field2) field2 = event2.created_at
            break
    }
    let ret: number = 0
    if (!field1) field1 = ""
    if (!field2) field2 = ""
    if (field1 && field2) {
        if (field1 < field2) ret = -1
        if (field1 > field2) ret = 1
        if (!asc) ret = -ret
    }
    //console.debug("sort:", field1, field2, ret)
    return ret
}

export class Articles extends Module {
    sub: NDKSubscription | null = null
    enabled: boolean = false
    resultSize: number = 0
    followAuthor: boolean = false
    author: string|undefined
    results: HTMLElement[] = []

    loadSettings() {
        this.followAuthor = this.settings(FOLLOW_AUTHOR_SETTING_KEY) == "1"? true : false
    }

    saveSettings() {
        this.settings(FOLLOW_AUTHOR_SETTING_KEY, this.followAuthor? "1" : null)
    }

    async articleHead(event: NDKWiki, relay?: NDKRelay) : Promise<void> {
        if (!event) { console.warn("Articles: no event!"); return}
        //console.debug("Search tags test:", event.getMatchingTags("l", "bcp47", { markerIndex: 2, useCase: false }))

        //console.log("Article event:", event)
        //console.debug(event.relay, event.onRelays)
        if (!this.isCurrent()) return
        //console.log("Articles enabled")
        const Head = $(ArtHeadHTML)
        Head.attr("data", JSON.stringify(event.rawEvent()))
        const title = Head.find(".ArticleTitle")
        let TT = event.title
        if (!TT) { TT = event.dTag }
        //console.log(`Received article "${TT}"`)
        title.text(TT)
        App.get().article.makeLinkActive(title, `/${event.naddr}`)

        const user = await App.get().user.get(event.pubkey)
        if (!this.isCurrent()) return
        let nick = user?.profile?.name
        if (!nick)  nick = "author"
        App.get().user.makeLinkActive(Head.find("a.AuthorNick"), `/${event.pubkey}`, nick)
        const picture = user?.profile?.picture
        const img = Head.find("img.AuthorImg")
        if (picture)
            img.attr("src", picture)
        else
            img.hide()
        Head.find("div.CreationTime").text(FormattedTime(event.created_at))
        Head.find("div.Relay").text(event?.relay?.url)

        Head.find("div.Summary").text(event.summary)
        const topics = EventTagValues(event, "t")
        const HeadTopics = Head.find(".Topics")
        topics.forEach((topic) => {
            const a = this.activeLink(`?t=${topic}`, topic)
            HeadTopics.append(a)
        })
        const es = event.size()
        Head.find(".EventSize").text(`${FormattedBytes(es, 2)}`)
        this.resultSize += es

        const fr = this.mainView().find("#FinderResult")
        this.results.push(Head.get(0))
        fr.append(Head)
        $("#FinderResultsNumber").text(`Results: ${fr.children().length}, size: ${FormattedBytes(this.resultSize, 2)}`)

    }

    sort() {
        this.results.sort(sortItems)
        const resn = $("#FinderResult")
        //console.debug("Finder results container:", resn)
        resn.empty()
        this.results.forEach((item) => {
            resn.append($(item))
        })
    }

    filter() {
        let text:string = $("#ArticlesFilterText").val()
        const content = $("#ArticlesFilterContent").prop("checked")
        const title = $("#ArticlesFilterTitle").prop("checked")
        const tagn = $("#ArticlesFilterTagName").prop("checked")
        const tagv = $("#ArticlesFilterTagValue").prop("checked")
        const caseS = $("#ArticlesFilterCase").prop("checked")

        const sr = $("#FinderResult")

        console.debug("Filter:", content, title, tagn, tagv, caseS)
        if (!caseS) text = text.toLocaleLowerCase()
        sr.children().each((index, item) => {
            item = $(item)
            try {
                if (!text) {
                    item.show()
                    return
                }
                const event = JSON.parse(item.attr("data"))
                let match: boolean = false
                if (content) {
                    const cText = caseS? event.content : event.content.toLocaleLowerCase()
                    if (cText.includes(text)) {
                        item.show()
                        return
                    }
                }
                if (title) {
                    const wiki = new NDKWiki(undefined, event)
                    let tText = caseS? wiki.title : wiki.title?.toLocaleLowerCase()
                    if (!tText)  tText = caseS? wiki.dTag : wiki.dTag?.toLocaleLowerCase()
                    if (tText?.includes(text)) {
                        item.show()
                        return
                    }
                }
                if (tagn) {
                    for (const tag of event.tags) {
                        const tText = caseS? tag[0] : tag[0]?.toLocaleLowerCase()
                        //console.debug("Tag names:", text, tText)
                        if (tText?.includes(text)) {
                            item.show()
                            return
                        }
                    }
                }
                if (tagv) {
                    for (const tag of event.tags) {
                        let i = 1
                        while(i < tag.length) {
                            const tText = caseS? tag[i] : tag[i]?.toLocaleLowerCase()
                            if (tText?.includes(text)) {
                                item.show()
                                return
                            }
                            i += 1
                        }
                    }
                }
                //console.debug("Hiding", event)
                item.hide()
            } catch(error) {
                console.error(error)
            }
        })
    }

    async finder() {
        const o = $(FinderHTML)
        this.mainView().append(o)
        const form = $("#FinderForm")
        form.prop("action", this.innerUrl(""))
        const me = form.find("button#FinderAuthorMe")
        const user = await App.get().user.get(null, false)
        if (!this.isCurrent()) return
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

        const relTags = App.get().relays.knownTags
        const tagsSel = form.find("#FinderRelaysTag")
        console.debug("Known tags:", relTags, tagsSel)
        for (const [tag, n] of relTags) {
            //const n = relTags.get(tag)
            if (n) {
                const op = App.get().relays.guiCreateKnownTag(tag, n)
                console.debug("Append tag:", tag, n)
                tagsSel.append(op)
            }
        }

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

        const aa = $("#ArticleAddress")
        const aag = $("#ArticleAddressGo")
        aag.click(() => {
            const addr = aa.val()
            if (addr)  App.get().article.navigate(`/${addr}`)
        })

        const rs = $("#ArticleAddressRelaysTagSelect")
        const tags = App.get().relays.knownTags
        const ckn = App.get().relays.guiCreateKnownTag
        for (const [tag, n] of tags)
            rs.append(ckn(tag, n))
        const a = App.get().article
        rs.val(a.relaysTag)
        rs.change(() => {
            a.relaysTag = rs.val()
            a.saveSettings()
        })

        const cnB = $("#CreateNewButton")
        const idI = form.find("input[name='id']")
        cnB.click(() => {
            let param = "?new=1"
            const id = idI.val()
            if (id)  param = param+`&id=${id}`
            App.get().article.navigate(`/edit/${param}`)
        })

        /*const sfi = $("select[name='ArticlesOrderField']")
        sfi.change(() => {
            this.sort()
        })*/
        $("#ArticlesSortButton").click(() => { this.sort() })
        $("#ArticlesFilterButton").click(() => { this.filter() })
    }

    isFinder(): boolean {
        return $("form#FinderForm").html()
    }

    clearFinderResult() {
        $("#FinderResult").empty()
    }

    async load(params: object,
        onEvent: (event: NDKEvent, relay?: NDKRelay) => any)
    {
        this.enabled = true
        this.resultSize = 0
        //console.log(await db.events.count())
        const filter: NDKFilter = {
            kinds: [30818]
            //'#d': [pageSlug]
        };

        const op: NDKSubscriptionOptions =
        {
            closeOnEose : true,
            onEvent: onEvent
        }

        if (params) {
            if (params.author) {
                console.log("Subscribing with author:", params.author)
                filter.authors = [ params.author ]
            }
            if (params.id) {
                console.log("Subscribing with id:", params.id)
                filter['#d'] = [ decodeURIComponent(formatNip54TagD(params.id)) ]
            }
            if (params.content) {
                console.debug("Subscribing with content:", params.content)
                filter.search = params.content
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
            if (params.relaysTag) {
                op.relayUrls = App.get().relays.getRelaysByTag(params.relaysTag)
                //console.debug("Subscribe with relays:", op.relayUrls)
            }
        }

        console.log("Subscribing for articles with filter", filter)
        
        try {
            this.sub = await NDKSync.syncAndSubscribe(
                this.ndk, filter, op)
            //console.debug(this.sub.relaySet)
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

    async handle(params: object) {
        this.newContext()
        const context = this.context
        this.loadSettings()
        //this.loadFinder(params.author, params.id)
        //console.debug($("input[name='id']"))
        $("input[name='id']").val(params.id)
        $("#FinderResultsNumber").text(`Results: 0, size: 0B`)
        this.author = params.followAuthor
        const err = await this.load(params,
            (event: NDKEvent, relay?: NDKRelay) => {
                if (!this.sameContext(context))  return
                //console.debug(this.followAuthor, params.followAuthor)
                if (this.followAuthor && event.pubkey == this.author) {
                    console.debug("Following the author...")
                    //console.debug(event.rawEvent())
                    const addr = event.naddr
                    App.get().article.navigate(`/${addr}`)
                } else this.articleHead(NDKWiki.from(event), relay)
            })
        if (err) {
            this.error(err)
        }
    }

    setup() {
        this.onRoute('', (match) => {
            this.setCurrent()
            console.log("Route: /articles")
            //console.log(match.params)
            $("#SearchLink").addClass("Current")
            this.results = []
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
        this.makeLinkActive($("#SearchLink"), "")
        this.loadSettings()
    }
}
