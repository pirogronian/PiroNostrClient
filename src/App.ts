

import $ from "jquery"
import NDK, { NDKEvent, NDKUser, NDKRelay } from "@nostr-dev-kit/ndk";
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie';
import { Relays } from '@/Relays.js';
import { User } from "@/User.js"

import { safeAsync } from "@/various.js"
import { Router } from "@/Router.js"
import { Module } from "@/Module.js"
import { About } from "@/About.js"
import { Articles } from '@/Articles.js';
import { Article } from "@/Article.js";
import { Drafts } from "./Drafts.js";
import type { CallExpression } from 'typescript/unstable/ast';

//import { LangTools } from "@/LangTools.js"

import "@/style.scss"

const CLIENT_NAME = "PiroNostrClient"

export class App extends Module {
    router: Router
    ndk: NDK
    about: About
    relays: Relays
    user: User
    articles: Articles
    article: Article
    drafts: Drafts

    static _app: App

    constructor() {
        super()
        this.register(CLIENT_NAME, "")
        App._app = this
        this.router = new Router()
        console.log("Router:", this.router)
        const cacheAdapter = new NDKCacheAdapterDexie({
            dbName: 'wiki-nostr-cache' });
        this.ndk = new NDK({ cacheAdapter,
             enableOutboxModel: true,
            aiGuardrails: true });
        this.ndk.clientName = CLIENT_NAME
        this.about = new About()
        this.about.register("about", "about", this)
        this.relays = new Relays()
        this.relays.register("relays", "relays", this)
        this.user = new User()
        this.user.register("user", "user", this)
        this.articles = new Articles()
        this.articles.register("articles", "articles", this)
        this.article = new Article()
        this.article.register("article", "article", this)
        this.drafts = new Drafts()
        this.drafts.register("drafts", "drafts", this)
    }

    static get() : App { return App._app }

    connect() { this.ndk.connect() }


    initRouting() {
        console.log("Init routing on:", window.location.href)

        this.router.hooks({
            before: (done, math) => {
                console.log("Route.before:", window.location.href)
                this.articles.stop()
                this.hideMessages()
                $("#MainNav a").removeClass("Current")
                done()
            },
        })
    }

    setupLocation() {
        const root = window.location.pathname
        let href = window.location.href
        href = href.replace("#/#/", "#/")
        const hindex = href.indexOf("#")
        const qindex = href.indexOf("?")
        if (qindex >= 0 && hindex >= 0 && hindex > qindex) {
            const qstr = href.substring(qindex, hindex)
            const hstr = href.substring(hindex)
            href = root.concat(hstr).concat(qstr)
            console.log("Fixing url to:", href)
        }
        if (!window.location.hash)  href = href.concat("#/")
        window.history.replaceState(null, href, href)
    }

    login(method?: string) {
        this.user.login(method)
    }

    logout() {
        this.user.logout()
    }

    reload() {
        this.router.navigate(window.location.hash.replace("#", ""))
    }

    guiIndex() {
        if (!this.isCurrent())  return
        $("#HomeLink").addClass("Current")
        this.clearUI()
        const invite = $("<p>Welcome to PiroNostrClient.</p>")
        this.mainView().append(invite)
        if (App.offline) {
            const offlineWarning = $("<p>")
            offlineWarning.append("You are offline. Got to the ")
            offlineWarning.append(this.relays.activeLink("", "Relays Section"))
            offlineWarning.append(" and add some accessable relays to be connected.")
            this.mainView().append(offlineWarning)
        }

    }

    setup() {
        this.about.setup()
        this.relays.setup()
        this.user.setup()
        this.article.setup()
        this.articles.setup()
        this.drafts.setup()

        this.makeLinkActive($("#HomeLink"), "")
        $("#Reload").click(() => { this.reload() })
        this.relays.on("offline", () => { console.debug("Offline!"); this.guiIndex() })
        this.relays.on("online", () => { console.debug("Online!"); this.guiIndex() })

        this.router.onRoute("/", (match) => {
            console.log("Route: default")
            this.setCurrent()
            if (match && match.params) {
                console.log("Index with params:", match.params)
            }
            this.guiIndex()
        })

        this.router.resolve();
    }
}
