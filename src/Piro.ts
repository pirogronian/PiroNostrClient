
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

    initRouting() {
        this.router.hooks({
            before: (done, math) => {
                this.articles.stop()
                this.ui.clear()
                done()
            }
        })

        this.router
        .on('/article/:id', async ({data}) => {
            const addr = data.id
            this.loadArticle(addr)
        })
        .on('/articles', (match) => {
            this.loadArticles(match?.params?.author, match?.params?.id)
        })
        .on('/search', (match) => {
            this.loadFinder()
        })
        .on('/settings/', () => {
            console.log("Route settings.")
            this.settings()
        })
        .on('/', () => {
            console.log("Main site.")
            this.home()
        });


        this.router.resolve();
    }

    login(method?: string) {
        this.user.login(method)
        this.settings()
    }

    logout() {
        this.user.logout()
        this.settings()
    }

    initHyperlinks() {
        this.ui.initRouting(this.router)
    }

    home() {
        this.ui.home()
    }

    settings() {
        const user = this.user.get()
        console.log(user)
        this.ui.settings()
        user.then((u) => {
            this.ui.user(u, { 
                onLogin: (method:string) => { this.login(method) }, 
                onLogout: () => { this.logout() } })
        })
        this.ui.Relays()
    }

    loadFinder(author: string|null = null, id: string|null = null) {
        this.ui.finder(this.router, author, id)
    }

    loadArticles(author: string | null, id: string | null) {
        this.loadFinder(author, id)
        const err = this.articles.load(author, id, 
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
