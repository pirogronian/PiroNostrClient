
import NDK, { NDKUser, NDKNip07Signer, NDKNip46Signer, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import $ from "jquery"
import { Module } from "@/Module.js"
import { App } from "@/App.js"

import UserHTML from "@/User.html?raw"

const SIGNER_KEY = "signer"
const NIP07 = "nip07"
const NIP46 = "nip46"
const PIVATEKEY = "privatekey"

export class User extends Module{
    async get(npub: string|null|undefined = null, profile: boolean = true) : Promise<NDKUser|null|undefined> {
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
            case NIP46:
                this.loginNip46Prepare()
                break;
        }
    }

    loginNip07() {
        const signer = new NDKNip07Signer()
        this.ndk.signer = signer
        this.settings(SIGNER_KEY, NIP07)
        if (this.isCurrent())
            this.navigate()
    }

    loginNip46Prepare() {
        console.debug("Nip-46 prepare.")

        const form = $("#UserLoginNIP46")
        form.show()
    }

    cancelNip46Login() {
        //this.ndk.signer = undefined
        $("#UserLoginNIP46").hide()
    }

    logout() {
        this.ndk.signer = undefined
        this.settings(SIGNER_KEY, null)
    }

    show(user: NDKUser|null|undefined) {
        const LoginForm = $("#Login")
        const UserHTML = $("#LoggedUser")
        const NickHtml = $("#LoggedUserNick")
        const PubkeyHtml = $("#LoggedUserPubkey")
        $("#UserLoginNIP46Cancel").click(() => {
            this.cancelNip46Login()
        })

        if (user) {
            LoginForm.hide()
            UserHTML.show()
            NickHtml.text(user.profile?.name || user.profile?.displayName || "")
            PubkeyHtml.text(user.pubkey)
            $("#Logout").click(() => {
                this.logout()
                if (this.isCurrent())
                    this.navigate()
            })
        } else {
            UserHTML.hide()
            NickHtml.text("")
            PubkeyHtml.text("")
            LoginForm.show()
            const selector = $("#LoginMethodSelect")
            selector.change(() => {
                this.login(selector.val())
            })
        }
    }

    handle() {
        const user = this.get()
        this.mainView().html(UserHTML)
        user.then((u) => {
            this.show(u)
        })
    }

    setup() {
        this.onRoute('', () => {
            this.setCurrent()
            this.clearUI()
            this.handle()
        })
        this.makeLinkActive($("#UserLink"), "")
    }
}
