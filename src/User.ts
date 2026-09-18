
import QRCode from "qrcode";
import NDK, { NDKUser, NDKNip07Signer, NDKNip46Signer, NDKPrivateKeySigner, NDKRelay } from "@nostr-dev-kit/ndk";
import $ from "jquery"

import { FormattedTime } from "./various.js";
import { Module } from "@/Module.js"
import { App } from "@/App.js"

import "@/User.scss"
import UserHTML from "@/User.html?raw"
import { InstallRelayDebugHandlers } from "./various.js";

const SIGNER_KEY = "signer"
const NIP07 = "nip07"
const NIP46 = "nip46"
const PIVATEKEY = "privatekey"

const CONFIGKEY_NIP46_PUBKEY = "nip46.pubkey"
const CONFIGKEY_NIP46_SECKEY = "nip46.seckey"
const CONFIGKEY_NIP46_RELAYS = "nip46.relays"

export class User extends Module {
    foreign: boolean = false
    tmpSigner?: NDKPrivateKeySigner
    waitingSigner?: NDKNip46Signer
    nip46autologin: boolean = false

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
            if (user && profile) {
                console.debug("Fetch user profile for", user.pubkey)
                await user.fetchProfile()
                if (user.profile)
                    console.debug("Profile loaded.")
                else
                    console.warn("Profile not loaded!")
            }
        }
        return user
    }

    login(method: string|void|null = null) {
        if (!method) {
            method = this.settings(SIGNER_KEY)
            console.debug("Choose login method from stored setting:", method)
        }
        switch (method) {
            case NIP07:
                this.loginNip07()
                break;
            case NIP46:
                if (this.restoreNip46Login()) {
                    if (this.isCurrent())
                        this.guiNip46Autologin()
                }
                else{
                    if (this.isCurrent())
                        this.loginNip46Prepare()
                }
                break;
        }
    }

    loginReload() {
        if (this.isCurrent() && !this.foreign)
            this.navigate()
    }

    guiLoginSelector() {
        return $("#LoginMethodSelect")
    }

    loginNip07() {
        const signer = new NDKNip07Signer()
        this.ndk.signer = signer
        this.settings(SIGNER_KEY, NIP07)
        this.loginReload()
    }

    encodeRelays(relays: string[]): string {
        return relays.map(r => `relay=${encodeURIComponent(r)}`).join("&")
    }

    guiNip46Autologin() {
        const nip46waitui = $("#UserLoginNIP46Restore")
        const fb = $("#UserLoginNIP46Forget")
        fb.click(() => {
            this.forgetNip46Login()
            nip46waitui.hide()
        })
        nip46waitui.show()
    }

    installNip46DebugHandlers() {
        const liveRelays = Array.from(this.waitingSigner?.rpc.pool.relays)
        //console.debug("Rpc relays:", liveRelays)
        liveRelays.forEach((relay) => {
            //console.debug("Rpc relay:", relay)
            if (typeof relay == "object" && relay[1] instanceof NDKRelay) {
                const r = relay[1]
                r.on("published", (event) => {
                    if (event.kind == 24133)
                        console.debug("p tag:", event.tagValue("p"))
                })
            }
                //InstallRelayDebugHandlers(relay[1])
        })
    }

    async loginNip46Prepare() {
        console.debug("Nip-46 prepare.")
        const relays = Array.from(this.ndk.pool.relays.keys())
        this.tmpSigner = NDKPrivateKeySigner.generate()
        const tmpUser = await this.tmpSigner.user()
        this.waitingSigner = new NDKNip46Signer(this.ndk, undefined, this.tmpSigner, relays, { name: App.get().settingsName })
        //this.installNip46DebugHandlers()
        //this.waitingSigner = NDKNip46Signer.nostrconnect(this.ndk, relays[0], this.tmpSigner)
        //this.waitingSigner.relayUrls = relays

        const relayParams = relays.map(r => `relay=${encodeURIComponent(r)}`).join("&")
        const connectionURI = `${this.waitingSigner.nostrConnectUri}&${relayParams}`
        //const canvas = $("#UserLoginNIP46NostrconnectURI").get(0)
        const canvas = $("#UserLoginNIP46QrCode").get(0)
        await QRCode.toCanvas(canvas, connectionURI)
        $("#UserLoginNIP46NostrconnectURI").text(connectionURI)
        $("#UserLoginNIP46").show()

        console.debug("Waiting for remote signer to accept.")
        const p = this.waitingSigner.blockUntilReady()
        p.then((user) => {
            console.debug("Remote signer accepted login as", user.pubkey)
            this.nostrConnectFinalize()
            this.loginReload()
        })
    }

    saveNip46() {
        //console.debug("user pubkey:", this.waitingSigner?.userPubkey)
        //console.debug("pubkey:", this.waitingSigner?.pubkey)
        //console.debug("remote user pubkey:", this.waitingSigner?.bunkerPubkey)
        this.settings(CONFIGKEY_NIP46_PUBKEY, this.waitingSigner?.bunkerPubkey)
        this.settings(CONFIGKEY_NIP46_SECKEY, this.waitingSigner?.localSigner.privateKey)
        this.settings(CONFIGKEY_NIP46_RELAYS, JSON.stringify(this.waitingSigner?.relayUrls))
    }

    restoreNip46Login(): boolean {
        this.nip46autologin = true
        const pubkey = this.settings(CONFIGKEY_NIP46_PUBKEY)
        if (!pubkey)  return false
        const seckey = this.settings(CONFIGKEY_NIP46_SECKEY)
        if (!seckey)  return false
        const relaysRaw = this.settings(CONFIGKEY_NIP46_RELAYS)
        let relays = []
        if (typeof relaysRaw == "string")
            relays = JSON.parse(relaysRaw)
        else return false
        this.tmpSigner = new NDKPrivateKeySigner(seckey)
        const token = `bunker://${pubkey}?${this.encodeRelays(relays)}`
        console.log("Restore session with bunker URI", token)
        this.waitingSigner = new NDKNip46Signer(this.ndk, token, this.tmpSigner, relays)
        this.waitingSigner.on("authUrl", (url) => { window.open(url, "auth") })
        //this.waitingSigner = NDKNip46Signer.bunker(this.ndk, token, this.tmpSigner)
        this.installNip46DebugHandlers()
        const p = this.waitingSigner.user()
        console.log("Waiting for remote signer to accept restored session.")
        p.then((user) => {
            console.log("Auto-login by NIP-46 accepted as", user.pubkey)
            this.ndk.signer = this.waitingSigner
            this.nip46autologin = false
            this.loginReload()
        })
        return true
    }

    forgetNip46Login() {
        this.settings(CONFIGKEY_NIP46_PUBKEY, null)
        this.settings(CONFIGKEY_NIP46_SECKEY, null)
        this.settings(CONFIGKEY_NIP46_RELAYS, null)
        this.nip46autologin = false
    }

    nostrConnectFinalize() {
        this.ndk.signer = this.waitingSigner
        this.settings(SIGNER_KEY, NIP46)
        this.saveNip46()
    }

    cancelNip46Login() {
        //this.ndk.signer = undefined
        delete this.waitingSigner
        delete this.tmpSigner
        $("#UserLoginNIP46").hide()
        this.guiLoginSelector().val("")
    }

    logout() {
        this.ndk.signer = undefined
        this.settings(SIGNER_KEY, null)
    }

    async show(user: NDKUser|null|undefined = undefined) {
        let me = false
        if (!user) {
            user = await this.get()
            if (user)  me = true
        }
        const LoginForm = $("#Login")
        const upn = $("#UserProfile")
        $("#UserLoginNIP46Cancel").click(() => {
            this.cancelNip46Login()
        })

        if (user) {
            const upkn = $("#UserPubkey")
            const ca = $("#UserCreatedAt")
            const unn = $("#UserName")
            const udnn = $("#UserDisplayName")
            const upictn = $("#UserPicture")
            const ubannern = $("#UserBanner")
            const ubion = $("#UserBio")
            const unip05n = $("#UserNip05")
            const ulud06n = $("#UserLud06")
            const ulud16n = $("#UserLud16")
            const uwebn = $("#UserWebsite a")
            LoginForm.hide()
            upn.show()
            upkn.text(user.pubkey)
            ca.text(FormattedTime(user.profile?.created_at))
            unn.text(user.profile?.name)
            udnn.text(user.profile?.displayName)
            upictn.find("img").prop("src", user.profile?.picture)
            ubannern.find("img").prop("src", user.profile?.banner)
            ubion.text(user.profile?.bio)
            unip05n.text(user.profile?.nip05)
            ulud06n.text(user.profile?.lud06)
            ulud16n.text(user.profile?.lud16)
            uwebn.text(user.profile?.website).prop("href", user.profile?.website)
            
            const ualn = $("#UserArticlesLink")
            App.get().articles.makeLinkActive(ualn, `?author=${user.pubkey}`)
            if (me) {
                $("#Logout").show().click(() => {
                    this.logout()
                    this.loginReload()
                })
            }
        } else {
            upn.hide()
            LoginForm.show()
            const selector = this.guiLoginSelector()
            selector.change(() => {
                this.login(selector.val())
            })
            if (this.nip46autologin && !this.foreign)
                this.guiNip46Autologin()
        }
    }

    async handle(id: string|undefined = undefined) {
        this.mainView().html(UserHTML)
        let user = undefined
        if (id) {
            user = await this.get(id)
            this.foreign = true
        } else this.foreign = false
            
        this.show(user)
    }

    setup() {
        this.onRoute('', () => {
            this.setCurrent()
            this.clearUI()
            this.handle()
        })
        this.onRoute('/:id', (match) => {
            this.setCurrent()
            this.clearUI()
            this.handle(match.data.id)
        })
        this.makeLinkActive($("#UserLink"), "")
    }
}
