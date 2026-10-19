
import $ from "jquery"
import { NDKEvent, NDKWiki, NDKRelay } from "@nostr-dev-kit/ndk";
import { NDKSubscriptionCacheUsage, type NDKFilter, type NDKSubscription, type NostrEvent } from "@nostr-dev-kit/ndk"
import { type SyncAndSubscribeOptions } from "@nostr-dev-kit/sync";
import { NDKSync } from "@nostr-dev-kit/sync"

import { EventTagValues, FormattedTime, FormattedBytes, formatNip54TagD, GuiCreateLabeledCacheUsageSelect } from "@/various.js";
import { Module } from "@/Module.js";
import { App } from "@/App.js"

import FinderHTML from "@/Finder.html?raw"
import FinderTagInputs from "@/FinderTagInputs.html?raw"
import ArtHeadHTML from "@/ArticleHeader.html?raw"

import "@/Articles.scss"

const RELAYS_TAG_SETTING = "relays_tag"
const CACHE_USAGE_SETTING = "cache_usage"
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

    return ret
}

export class Articles extends Module {
    sub: NDKSubscription | null = null
    enabled: boolean = false
    relaysTag: string = ""
    cacheUsage: NDKSubscriptionCacheUsage = NDKSubscriptionCacheUsage.PARALLEL
    resultSize: number = 0
    resultRelays: Map<string, number> = new Map<string, number>()
    followAuthor: boolean = false
    author: string|undefined
    results: HTMLElement[] = []

    loadSettings() {
        this.relaysTag = this.settings(RELAYS_TAG_SETTING) || ""
        this.cacheUsage = this.settings(CACHE_USAGE_SETTING) as NDKSubscriptionCacheUsage || NDKSubscriptionCacheUsage.PARALLEL
        this.followAuthor = this.settings(FOLLOW_AUTHOR_SETTING_KEY) == "1"? true : false
    }

    saveSettings() {
        //console.debug("Saving relays_tag:", this.relaysTag)
        this.settings(RELAYS_TAG_SETTING, this.relaysTag || null)
        this.settings(CACHE_USAGE_SETTING, this.cacheUsage)
        this.settings(FOLLOW_AUTHOR_SETTING_KEY, this.followAuthor? "1" : null)
    }

    async articleHead(event: NDKWiki, relay?: NDKRelay) : Promise<void> {
        if (!event) { console.warn("Articles: no event!"); return}

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

        $("#ArticlesRelaysTagPlaceholder").replaceWith(
            App.get().relays.guiCreateTagLabeledSelect(
                (val: string) => {
                    this.relaysTag = val
                    this.saveSettings()
                },
                this.relaysTag
            ))

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

        form.find("#FinderStop").click(() => {
            this.sub?.stop()
            console.debug("Sub stopped.")
        })

        const aa = $("#ArticleAddress")
        const aag = $("#ArticleAddressGo")
        aag.click(() => {
            const addr = aa.val()
            if (addr)  App.get().article.navigate(`/${addr}`)
        })

        const cnB = $("#CreateNewButton")
        const idI = form.find("input[name='id']")
        cnB.click(() => {
            let param = "?new=1"
            const id = idI.val()
            if (id)  param = param+`&id=${id}`
            App.get().article.navigate(`/edit/${param}`)
        })

        $("#ArticleBrowseCacheUsagePlaceholder").replaceWith(
            GuiCreateLabeledCacheUsageSelect(
                (val: string) => { this.cacheUsage = val; this.saveSettings() }, this.cacheUsage
            ))

        $("#ArticlesSortButton").click(() => { this.sort() })
        $("#ArticlesFilterButton").click(() => { this.filter() })
    }

    isFinder(): boolean {
        return $("form#FinderForm").html()
    }

    clearFinderResult() {
        $("#FinderResult").empty()
    }

    onRelayResult(url: string|NDKRelay) {
        if (typeof url != "string")  url = url.url
        let n = this.resultRelays.get(url)
        if (n == undefined) n = 1
        else n++
        this.resultRelays.set(url, n)
    }

    guiUpdateRelaysResult() {
        const num = $("#FinderResultsRelaysNumber")
        const urls = $("#FinderResultsRelays")
        num.text(`Relays: ${this.resultRelays.size}`)
        urls.empty()
        for (const [url, n] of this.resultRelays) {
            const div = $("<div>")
            div.html(`'<span class="Copyable Url">${url}</span>' (${n})`)
            //div.addClass("Copyable")
            urls.append(div)
        }
    }

    guiClearSummary() {
        $("#FinderResultsNumber").empty()
        $("#FinderResultsRelaysNumber").empty()
        $("#FinderResultsRelays").empty()
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

        const op: SyncAndSubscribeOptions =
        {
            closeOnEose : true,
            onEvent: (event: NDKEvent, relay?: NDKRelay, sub?: NDKSubscription, fromCache?: boolean) => {
                if (relay)  {
                    if (!this.resultRelays.has(relay.url))
                        console.debug("New relay in results:", relay.url, fromCache? "(from cache)": "")
                    this.onRelayResult(relay.url)
                    this.guiUpdateRelaysResult()
                }
                onEvent(event, relay)
            },
            onEventDup: (event: NDKEvent|NostrEvent, relay?: NDKRelay, u?: number, sub?: NDKSubscription, fromCache?: boolean) => {
                if (relay) {
                    if (!this.resultRelays.has(relay.url))
                        console.debug("New relay in results (dup):", relay.url, fromCache? "(from cache)": "")
                    this.onRelayResult(relay.url)
                    this.guiUpdateRelaysResult()
                }
            }
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
        }
        if (this.relaysTag) {
            op.relayUrls = App.get().relays.getRelaysByTag(this.relaysTag)
            op.exclusiveRelay = true
            console.debug("Subscribe with relays:", op.relayUrls, "with tag:", this.relaysTag)
        }
        op.cacheUsage = this.cacheUsage

        op.onRelayError = (relay: NDKRelay, error: Error) => {
            if (this.sub) relay.subscribe(this.sub, [filter])
        }

        console.log("Subscribing for articles with filter", filter)

        try {
            if (op.cacheUsage == NDKSubscriptionCacheUsage.ONLY_CACHE ||
                op.cacheUsage == NDKSubscriptionCacheUsage.ONLY_RELAY
            )  this.sub = this.subscribeForEvents(filter, op)
            else  this.sub = await NDKSync.syncAndSubscribe(this.ndk, filter, op)
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
        this.resultRelays.clear()
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
                this.guiClearSummary()
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
