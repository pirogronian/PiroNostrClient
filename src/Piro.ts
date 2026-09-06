
import Navigo from 'navigo';
import NDK, { NDKEvent, NDKUser, NDKRelay } from "@nostr-dev-kit/ndk";
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie';
import { UI } from "./UI.js"
import { Relays } from './Relays.js';
import { User } from "./User.js"

import { safeAsync } from "./various.js"
import { LoadArticle } from "./Article.js"
import { Articles } from './Articles.js';
import type { CallExpression } from 'typescript/unstable/ast';

export class Piro {
    router: Navigo
    ndk: NDK
    relays: Relays
    user: User
    ui: UI
    articles: Articles

    constructor() {
        this.router = new Navigo('/', { hash: true })
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

    connect() { this.ndk.connect() }

    onRoute(route: string, f: Function) {
        this.router.on(route, f, { already: f })
    }

    initRouting() {
        this.router.hooks({
            before: (done, math) => {
                this.articles.stop()
                done()
            }
        })

        this.onRoute('/article/:id', async ({data}) => {
            this.ui.clear()
            const addr = data.id
            this.loadArticle(addr)
        })
        this.onRoute('/articles', (match) => {
            console.log(match.params)
            if (Object.entries(match.params).length > 0) {
                this.ui.clearFinderResult()
                this.ui.finder(this.router)
            }
            else {
                console.log("Clear UI.")
                this.ui.clear()
                this.ui.finder(this.router, true)
            }
            this.loadArticles(match?.params)
        })
        this.onRoute('/search', (match) => {
            console.log("Route: /search")
            this.ui.clear()
            this.loadFinder()
        })
        this.onRoute('/settings', () => {
            console.log("Route settings.")
            this.ui.clear()
            this.settings()
        })
        this.onRoute('/', () => {
            console.log("Main site.")
            this.ui.clear()
            this.home()
        });


        this.router.resolve();
    }

    login(method?: string) {
        this.user.login(method)
        //this.settings()
    }

    logout() {
        this.user.logout()
        //this.settings()
    }

    initHyperlinks() {
        this.ui.initRouting(this.router)
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
                } })
        })
        this.ui.Relays()
    }

    loadFinder(author: string|null = null, id: string|null = null) {
        this.ui.finder(this.router, author, id)
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
