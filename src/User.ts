
import QRCode from "qrcode";
import NDK, { NDKUser, NDKNip07Signer, NDKNip46Signer, NDKPrivateKeySigner, NDKRelay, NDKRelayList } from "@nostr-dev-kit/ndk";
import $ from "jquery"
import type JQuery from "jquery"

import { FormattedTime } from "./various.js";
import { Module } from "@/Module.js"
import { App } from "@/App.js"

import "@/User.scss"
import UserHTML from "@/User.html?raw"
import { InstallRelayDebugHandlers } from "./various.js";

const ADD_READ_RELAY_EVENT = "addReadRelay"
const ADD_WRITE_RELAY_EVENT = "addWriteRelay"
const REMOVE_READ_RELAY_EVENT = "removeReadRelay"
const REMOVE_WRITE_RELAY_EVENT = "removeWriteRelay"

const SIGNER_KEY = "signer"
const NIP07 = "nip07"
const NIP46 = "nip46"
const PIVATEKEY = "privatekey"

const CONFIGKEY_NIP46_PUBKEY = "nip46.pubkey"
const CONFIGKEY_NIP46_SECKEY = "nip46.seckey"
const CONFIGKEY_NIP46_RELAYS = "nip46.relays"

export class User extends Module {
    user?: NDKUser|null|undefined
    foreign: boolean = false
    loggedUser?: NDKUser|null|undefined
    loggedRelays?: NDKRelayList|null|undefined
    loggedRelaysChanged: boolean = false
    tmpSigner?: NDKPrivateKeySigner
    waitingSigner?: NDKNip46Signer
    nip46autologin: boolean = false

    async get(npub: string|null|undefined = null, profile: boolean = true) : Promise<NDKUser|null|undefined> {
        let user : NDKUser|null|undefined = null

        if (!npub && this.ndk.signer) {
            user = await this.ndk.signer.user()
            if (user && profile) {
                //console.log("Fetching profile...")
                await user.fetchProfile({
                    closeOnEose: true,
                    groupable: false
                })
            }
        }
        if (npub) {
            user = await this.ndk.fetchUser(npub)
            if (user && profile) {
                //console.debug("Fetch user profile for", user.pubkey)
                await user.fetchProfile()
                /*if (user.profile)
                    console.debug("Profile loaded.")
                else
                    console.warn("Profile not loaded!")*/
            }
        }
        return user
    }

    async onLogin() {
        this.loggedUser = await this.get()
        this.loggedRelays = await this.relays(this.loggedUser)
        if (this.loggedRelays) {
            //console.debug("User's relays loaded.")
            App.get().relays.guiRefreshItems()
        }
        else console.warn("User's relays not loaded!")
        this.loggedRelaysChanged = false
        this.emit("login")
    }

    onLogout() {
        this.loggedUser = undefined
        this.loggedRelays = undefined
        App.get().relays.guiRefreshItems()
        this.emit("logout")
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
        this.onLogin()
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
        const bunkerLabel = $("label[for='UserLoginNIP46BunkerUrl']")
        const bunkerInput = bunkerLabel.find("input")
        const bunkerButton = bunkerLabel.find("button")
        bunkerButton.click(() => {
            this.hideMessages()
            const signer = new NDKNip46Signer(this.ndk, bunkerInput.val(), this.tmpSigner, relays, { name: App.get().settingsName })
            const p = signer.blockUntilReady()
            p.then((user) => {
                this.waitingSigner = signer
                this.onNip46Login(user)
            }).catch((error) => {
                this.error(error)
                console.error(error)
            })
        })
        //bunkerInput.on("input", (e) => { console.log("Input submitted:", e) })

        const relayParams = relays.map(r => `relay=${encodeURIComponent(r)}`).join("&")
        const connectionURI = `${this.waitingSigner.nostrConnectUri}&${relayParams}`
        const canvas = $("#UserLoginNIP46QrCode").get(0)
        await QRCode.toCanvas(canvas, connectionURI)
        $("#UserLoginNIP46NostrconnectURI").text(connectionURI)
        $("#UserLoginNIP46").show()

        console.debug("Waiting for remote signer to accept.")
        const p = this.waitingSigner.blockUntilReady()
        p.then((user) => {
            this.hideMessages()
            this.onNip46Login(user)    
        }).catch((error) => {
            this.error(error)
            console.error(error)
        })
    }

    onNip46Login(user: NDKUser) {
        console.debug("Remote signer accepted login as", user.pubkey)
        this.nostrConnectFinalize()
        this.loginReload()
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
        //this.installNip46DebugHandlers()
        const p = this.waitingSigner.user()
        console.log("Waiting for remote signer to accept restored session.")
        p.then((user) => {
            console.log("Auto-login by NIP-46 accepted as", user.pubkey)
            this.ndk.signer = this.waitingSigner
            this.nip46autologin = false
            this.onLogin()
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
        this.onLogin()
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
        this.onLogout()
        this.settings(SIGNER_KEY, null)
        this.forgetNip46Login()
    }

    async relays(user: NDKUser|string|null|undefined = undefined) {
        let pubkey:string|undefined = ""
        if (!user)  pubkey = this.user?.pubkey
        if (user && typeof user == "object")  pubkey = user.pubkey
        if (!pubkey)  return
        const event = await this.ndk.fetchEvent({
            kinds: [10002],
            authors: [pubkey]
        })
        if (event)
            return NDKRelayList.from(event)
    }

    isReadRelay(relay: NDKRelay|string): boolean {
        const url = typeof relay == "string"? relay : relay.url
        if (this.loggedRelays) {
            return this.loggedRelays.readRelayUrls.includes(url)
        }
        return false
    }

    isWriteRelay(relay: NDKRelay|string): boolean {
        const url = typeof relay == "string"? relay : relay.url
        if (this.loggedRelays) {
            return this.loggedRelays.writeRelayUrls.includes(url)
        }
        return false
    }

    addReadRelay(relay: NDKRelay|string): boolean {
        const url = typeof relay == "string"? relay : relay.url
        if (!url) {
            console.warn("Trying add a null url!", url)
            return false
        }
        if (this.isReadRelay(url)) {
            console.warn("Relay", url, "already in reads.")
            return false
        }
        if (this.loggedRelays) {
            //console.debug("Adding", url, "to read relays.")
            let list = this.loggedRelays.readRelayUrls
            list.push(url)
            this.loggedRelays.readRelayUrls = list
            if (!this.isReadRelay(url))  console.error("Relay wasn't added properly!")
            else this.emit(ADD_READ_RELAY_EVENT, url)
            this.loggedRelaysChanged = true
            return true
        }
        return false
    }

    addWriteRelay(relay: NDKRelay|string): boolean {
        const url = typeof relay == "string"? relay : relay.url
        if (!url) {
            console.warn("Trying add a null url!", url)
            return false
        }
        //console.debug("Adding read relay", url)
        if (this.isWriteRelay(url)) {
            console.warn("Relay", url, "already in writes.")
            return false
        }
        if (this.loggedRelays) {
            //console.debug("Adding", url, "to write relays.")
            let list = this.loggedRelays.writeRelayUrls
            list.push(url)
            this.loggedRelays.writeRelayUrls = list
            if (!this.isWriteRelay(url))  console.error("Relay wasn't added properly!")
            else this.emit(ADD_WRITE_RELAY_EVENT, url)
            this.loggedRelaysChanged = true
            return true
        }
        return false
    }

    removeReadRelay(relay: NDKRelay|string): boolean {
        const url = typeof relay == "string"? relay : relay.url
        //console.debug("Removing read relay", url)
        if (this.loggedRelays) {
            let list = this.loggedRelays.readRelayUrls
            const index = list.indexOf(url)
            if (index < 0)  return false
            //console.debug("Removing", url, "from read relays.")
            //delete list[index]
            list.splice(index, 1)
            const list2 = this.loggedRelays.writeRelayUrls
            this.loggedRelays.removeTag("r")
            this.loggedRelays.removeTag("relay")
            this.loggedRelays.readRelayUrls = list
            this.loggedRelays.writeRelayUrls = list2
            if (this.isReadRelay(url))  console.error("Relay wasn't removed properly!")
            else this.emit(REMOVE_READ_RELAY_EVENT, url)
            this.loggedRelaysChanged = true
            return true
        }
        return false
    }

    removeWriteRelay(relay: NDKRelay|string): boolean {
        const url = typeof relay == "string"? relay : relay.url
        //console.debug("Removing write relay", url)
        if (this.loggedRelays) {
            let list = this.loggedRelays.writeRelayUrls
            const index = list.indexOf(url)
            if (index < 0)  return false
            //console.debug("Removing", url, "from write relays.")
            //delete list[index]
            list.splice(index, 1)
            const list2 = this.loggedRelays.readRelayUrls
            this.loggedRelays.removeTag("r")
            this.loggedRelays.removeTag("relay")
            this.loggedRelays.writeRelayUrls = list
            this.loggedRelays.readRelayUrls = list2
            if (this.isWriteRelay(url))  console.error("Relay wasn't removed properly!")
            else this.emit(REMOVE_WRITE_RELAY_EVENT, url)
            this.loggedRelaysChanged = true
            return true
        }
        return false
    }

    guiPublishRelaysButton() {
        return $("#PublishRelaysButton")
    }

    guiPublishRelaysButtonSetup() {
        this.guiPublishRelaysButton().click(() => { this.publishRelays() })
    }

    onUserRelaysChange() {
        console.debug("User's relays changed.")
        this.guiPublishRelaysButton().show()
    }

    publishRelays() {
        if (!this.loggedRelays) {
            console.warn("No relays to publish!")
            return
        }
        const id = this.loggedRelays.getEventHash()
        console.debug("Publishing user's relays with hash", id)
        const p = this.loggedRelays.publishReplaceable()
        p.then(() => {
            console.debug("User's relays published.")
            this.loggedRelaysChanged = false
            this.guiPublishRelaysButton().text("Publish user's relays").hide()
            this.hideMessages()
        }).catch((error) => {
            this.guiPublishRelaysButton().text("Unable to publish relays! (push to retry)")
            this.error(error.msg)
            console.error(error)
        })
    }

    async show(user: NDKUser|null|undefined = undefined) {
        const context = this.context
        this.mainView().html(UserHTML)
        const LoginForm = $("#Login")
        const upn = $("#UserProfile")
        const selector = this.guiLoginSelector()
        selector.change(() => {
            this.login(selector.val())
        })
        $("#UserLoginNIP46Cancel").click(() => {
            this.cancelNip46Login()
        })

        if (!user)  user = this.user

        if (user) {
            LoginForm.hide()
            upn.show()
            if (!user.profile)  this.warning("Loading user profile failed.")
            const upkn = $("#UserPubkey")
            const unpn = $("#UserNPub")
            const unprn = $("#UserNProfile")
            const ca = $("#UserCreatedAt")
            const unn = $("#UserName")
            const udnn = $("#UserDisplayName")
            const upictn = $("#UserPicture")
            const ubannern = $("#UserBanner")
            const ubion = $("#UserBio")
            const unip05n: JQuery<HTMLElement> = $("#UserNip05")
            const ulud06n = $("#UserLud06")
            const ulud16n = $("#UserLud16")
            const uwebn = $("#UserWebsite a")
            upkn.text(user.pubkey)
            upkn.click(() => {
                navigator.clipboard.writeText(user.pubkey)
            })
            unpn.text(user.npub)
            unpn.click(() => {
                navigator.clipboard.writeText(user.npub)
            })
            unprn.text(user.nprofile)
            unprn.click(() => {
                navigator.clipboard.writeText(user.nprofile)
            })
            ca.text(FormattedTime(user.profile?.created_at))
            unn.text(user.profile?.name)
            udnn.text(user.profile?.displayName)
            upictn.find("img").prop("src", user.profile?.picture)
            ubannern.find("img").prop("src", user.profile?.banner)
            ubion.text(user.profile?.bio)
            unip05n.text(user.profile?.nip05)
            if (user.profile?.nip05) {
                unip05n.click(() => {
                    navigator.clipboard.writeText(user.nprofile)
                })
                user.validateNip05(user.profile.nip05).then((valid) => {
                    if (valid) {
                        unip05n.parent().prop("title", "Valid").find(".Valid").show()
                    }
                    else  unip05n.parent().prop("title", "Invalid!").find(".Invalid").show()
                })
            }
            ulud06n.text(user.profile?.lud06)
            ulud16n.text(user.profile?.lud16)
            ulud16n.click(() => {
                navigator.clipboard.writeText(user.profile?.lud16 ? user.profile?.lud16 : "")
            })
            uwebn.text(user.profile?.website).prop("href", user.profile?.website)
            
            const ualn = $("#UserArticlesLink")
            App.get().articles.makeLinkActive(ualn, `?author=${user.pubkey}`)
            ualn.show()
            if (!this.foreign) {
                $("#Logout").show().click(() => {
                    this.logout()
                    this.loginReload()
                })
            }

            const rl = await this.relays()
            //console.debug("User relays:", rl?.readRelayUrls, rl?.writeRelayUrls)
            const rrn = $("#UserReadRelays")
            const rrnn = $("#UserReadRelaysNumber")
            rrnn.text(rl?.readRelayUrls ? rl?.readRelayUrls.length : 0)
            if (typeof rl?.readRelayUrls == "object") {
                for (const url of rl?.readRelayUrls) {
                    if (url) {
                        rrn.append(App.get().relays.guiCreateItem(url))
                        App.get().relays.guiRefreshItem(url)
                    }
                }
            }
                
            const wrn = $("#UserWriteRelays")
            const wrnn = $("#UserWriteRelaysNumber")
            wrnn.text(rl?.writeRelayUrls ? rl?.writeRelayUrls.length : 0)
            if (typeof rl?.writeRelayUrls == "object")
                for (const url of rl?.writeRelayUrls) {
                    if (url) {
                        wrn.append(App.get().relays.guiCreateItem(url))
                        App.get().relays.guiRefreshItem(url)
                    }
            }
        } else {
            upn.hide()
            LoginForm.show()
            if (this.nip46autologin && !this.foreign)
                this.guiNip46Autologin()
        }
        this.guiPublishRelaysButtonSetup()
    }

    async handle(id: string|undefined = undefined) {
        this.newContext()
        const context = this.context
        if (id) {
            this.user = await this.get(id)
            if (!this.sameContext(context))  return
            this.foreign = true
        } else {
            this.foreign = false
            this.user = await this.get()
            if (!this.sameContext(context))  return
        }
            
        this.show()
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

        this.on(ADD_READ_RELAY_EVENT, () => { this.onUserRelaysChange() })
        this.on(ADD_WRITE_RELAY_EVENT, () => { this.onUserRelaysChange() })
        this.on(REMOVE_READ_RELAY_EVENT, () => { this.onUserRelaysChange() })
        this.on(REMOVE_WRITE_RELAY_EVENT, () => { this.onUserRelaysChange() })
    }
}
