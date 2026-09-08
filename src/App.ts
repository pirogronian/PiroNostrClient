
import NDK, { NDKEvent, NDKUser, NDKRelay } from "@nostr-dev-kit/ndk";
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie';
import { UI } from "./UI.js"
import { Relays } from './Relays.js';
import { User } from "./User.js"

import { safeAsync } from "./various.js"
import { Router } from "./Router.js"
import { LoadArticle } from "./Article.js"
import { Articles } from './Articles.js';
import type { CallExpression } from 'typescript/unstable/ast';

export class App {
    router: Router
    ndk: NDK
    relays: Relays
    user: User
    ui: UI
    articles: Articles

    static _app: App

    constructor() {
        App._app = this
        this.router = new Router()
        console.log("Router:", this.router)
        const cacheAdapter = new NDKCacheAdapterDexie({ dbName: 'wiki-nostr-cache' });
        this.ndk = new NDK({ cacheAdapter });
        this.relays = new Relays(this.ndk)
        this.user = new User(this.ndk)
        this.articles = new Articles(this.ndk)
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
                done()
            },
            after: (math) => {
                this.initHyperlinks()
            }
        })

        this.router.onRoute('/article/:id', async ({data}) => {
            console.log("Route: /article/:id")
            this.ui.clear()
            const addr = data.id
            this.loadArticle(addr)
        })
        this.router.onRoute('/articles', (match) => {
            console.log("Route: /articles")
            //console.log(match.params)
            if (this.ui.isFinder()) {
                console.log("Is finder, clearing results.")
                this.ui.clearFinderResult()
            }
            else {
                console.log("Clear main view, create finder.")
                this.ui.clear()
                this.ui.finder()
            }
            this.loadArticles(match?.params)
        })
        this.router.onRoute('/search', (match) => {
            console.log("Route: /search")
            this.ui.clear()
            this.loadFinder()
        })
        this.router.onRoute('/settings', () => {
            console.log("Route: settings.")
            this.ui.clear()
            this.settings()
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

    settings() {
        console.log("Settings")
        const user = this.user.get()
        console.log(user)
        this.ui.settings()
        user.then((u) => {
            this.ui.user(u, {
                onLogin: (method:string) => {
                    this.login(method);
                    this.router.navigate("/settings")
                },
                onLogout: () => {
                    this.logout();
                    this.router.navigate("/settings")
                }})
        })
        this.ui.Relays()
    }

    loadFinder() {
        this.ui.finder()
    }

    loadArticles(params: object) {
        //this.loadFinder(params.author, params.id)
        const err = this.articles.load(params,
            (event: NDKEvent, relay?: NDKRelay) => {
                this.ui.ArticleHead(event, relay)
            })
        if (err) {
            this.ui.error(err.message)
        }
    }

    async loadArticle(addr: string) {
        const ret = await LoadArticle(this.ndk, addr)
        if (ret instanceof NDKEvent) {
            this.ui.article(ret)
        } else {
            if (ret instanceof Error) {
                this.ui.error(ret.message)
            }
            if (typeof(ret) == "string") {
                this.ui.error(ret)
            }
        }
    }
}
