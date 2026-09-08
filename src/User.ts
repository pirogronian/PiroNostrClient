
import NDK, { NDKUser, NDKNip07Signer } from "@nostr-dev-kit/ndk";
import $ from "jquery"
import { Module } from "@/Module.js"

import UserHTML from "@/User.html?raw"

const SIGNER_KEY = "signer"
const NIP07 = "nip07"
const PIVATEKEY = "privatekey"

export class User extends Module{

    async get(npub: string|null = null, profile: boolean = true) : Promise<NDKUser|null|undefined> {
        let user : NDKUser|null|undefined = null

        if (!npub && this.ndk.signer) {
            user = await this.ndk.signer.user()
            if (user && profile) {
                console.log("Fetching profile...")
                await user.fetchProfile({
                    closeOnEose: true,
                    groupable: false
                })
            }
        }
        if (npub) {
            user = await this.ndk.fetchUser(npub)
            if (user && profile) await user.fetchProfile()
        }
        return user
    }

    login(method: string|null = null) {
        if (!method) { method = localStorage.getItem(SIGNER_KEY) }
        switch (method) {
            case NIP07:
                this.loginNip07()
                break;
        }
    }

    loginNip07() {
        const signer = new NDKNip07Signer()
        this.ndk.signer = signer
        this.settings(SIGNER_KEY, NIP07)
    }

    logout() {
        this.ndk.signer = undefined
        this.settings(SIGNER_KEY, null)
    }

    show(user: NDKUser | null, handlers: { onLogin: (method: string) => any, onLogout: () => any}) {
        const LoginForm = $("#Login")
        const UserHTML = $("#LoggedUser")
        const NickHtml = $("#LoggedUserNick")
        const PubkeyHtml = $("#LoggedUserPubkey")
        if (user) {
            LoginForm.hide()
            UserHTML.show()
            NickHtml.text(user.profile?.name || user.profile?.displayName || "")
            PubkeyHtml.text(user.pubkey)
            $("#Logout").click(() => { handlers.onLogout() })
        } else {
            UserHTML.hide()
            NickHtml.text("")
            PubkeyHtml.text("")
            LoginForm.show()
            $("#LoginMethodSelect").change((e) => {
                handlers.onLogin($(e.currentTarget).val())
            })
        }
    }

    handle() {
        const user = this.get()
        this.mainView().html(UserHTML)
        user.then((u) => {
            this.show(u, {
                onLogin: (method:string) => {
                    this.login(method);
                    this.navigate()
                },
                onLogout: () => {
                    this.logout();
                    this.navigate()
                }})
        })
    }

    setup() {
        this.onRoute('', (match) => {
            this.clearUI()
            this.handle()
        })
        this.makeLinkActive($("#UserLink"), "")
    }
}
