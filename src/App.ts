
import NDK, { NDKEvent, NDKUser, NDKRelay } from "@nostr-dev-kit/ndk";
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie';
import { UI } from "@/UI.js"
import { Relays } from '@/Relays.js';
import { User } from "@/User.js"

import { safeAsync } from "@/various.js"
import { Router } from "@/Router.js"
import { Module } from "@/Module.js"
import { Articles } from '@/Articles.js';
import { Article } from "@/Article.js";
import type { CallExpression } from 'typescript/unstable/ast';

export class App extends Module {
    router: Router
    ndk: NDK
    relays: Relays
    user: User
    ui: UI
    articles: Articles
    article: Article

    static _app: App

    constructor() {
        super()
        this.register("PiroNostrClient", "")
        App._app = this
        this.router = new Router()
        console.log("Router:", this.router)
        const cacheAdapter = new NDKCacheAdapterDexie({ dbName: 'wiki-nostr-cache' });
        this.ndk = new NDK({ cacheAdapter });
        this.relays = new Relays()
        this.relays.register("relays", "relays", this)
        this.user = new User()
        this.user.register("user", "user", this)
        this.articles = new Articles()
        this.articles.register("articles", "articles", this)
        this.article = new Article()
        this.article.register("article", "article", this)
        this.ui = new UI(this.ndk)
        this.ndk.pool.on('relay:connect', () => {
            this.relays.save();
        });
        this.relays.load()
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
                done()
            },
        })
        
        this.router.onRoute('/', () => {
            console.log("Coute: home")
            this.ui.clear()
            this.home()
        });
        this.router.onRoute("", (match) => {
            console.log("Route: default")
            if (match && match.params) {
                console.log("Index with params.")
            } else {
                this.ui.clear()
                this.home()
            }
        })

        this.router.resolve();
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
        window.history.replaceState(null, href, href)
    }

    login(method?: string) {
        this.user.login(method)
        //this.settings()
    }

    logout() {
        this.user.logout()
        //this.settings()
    }

    initUI() {
        this.ui.init()
    }

    initHyperlinks() {
        this.ui.initLinks()
    }

    home() {
        this.ui.home()
    }
}
