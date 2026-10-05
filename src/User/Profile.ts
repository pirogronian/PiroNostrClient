
import $, { type JQuery } from "jquery"

import { NDKEvent, NDKUser, type NDKUserProfile } from "@nostr-dev-kit/ndk";

import { MakeCopyable, FormattedTime, CreateLink, JTagName } from "@/various.js";

import { Module } from "@/Module.js";
import { App } from "@/App.js"

import ProfileHTML from "./Profile.html?raw"

export class Profile extends Module {
    user: NDKUser|undefined
    editMode: boolean = false
    editProfile: NDKUserProfile|undefined
    editEvent: NDKEvent|undefined
    event: NDKEvent|undefined

    readonly StandardMembers = new Set<string>([
        "pubkey",
        "created_at",
        "cachedAt",
        "name",
        "displayName",
        "image",
        "picture",
        "banner",
        "bio",
        "nip05",
        "lud06",
        "lud16",
        "about",
        "website",
        "profileEvent"
    ])

    readonly GuiSelectors = {
        Profile: "#UserProfile",
        Additional: "#UserProfileAdditionalFields",
        Pubkey: "#UserPubkey",
        NPub: "#UserNPub",
        NProf: "#UserNProfile",
        CreatedAt: "#UserCreatedAt",
        CachedAt: "#UserCachedAt",
        Name: "#UserName span.Value",
        DisplayName: "#UserDisplayName span.Value",
        Picture: "#UserPicture img",
        Banner: "#UserBanner img",
        Nip05: "#UserNip05 span.Value",
        Lud06: "#UserLud06 span.Value",
        Lud16: "#UserLud16 span.Value",
        About: "#UserAbout span.Value",
        Website: "#UserWebsite .Value"
    }

    guiCustomField(name: string, value?: string) {
        const pinfo = $(this.GuiSelectors.Profile).find("dl.Info")
        const keyNode = $("<dt>")
        keyNode.text(name)
        const defNode = $("<dd>")
        const valNode = $("<div>")
        const iNode = $("<input>")
        defNode.prop("id", `UserProfileField${name}`)
        valNode.addClass("Value")
        if (value !== null && value !== undefined) {
            if (typeof value == "string") {
                const link = CreateLink(value)
                if (link) {
                    valNode.append(link)
                } else  MakeCopyable(valNode, value)
            }
            else valNode.text(`${value}`)
        }
        iNode.prop("type", "text")
        iNode.prop("name", name)
        iNode.addClass("Input")
        iNode.hide()
        pinfo.append(keyNode)
        defNode.append(valNode)
        defNode.append(iNode)
        pinfo.append(defNode)
    }

    guiShow() {
        if (!this.user) {
            console.warn("No user to show profile for!")
            return
        }
        $("#UserProfilePreview").hide()
        const ee = $("#UserProfileExitEdit")
        if (this.editMode) ee.show()
        else ee.hide()

        let profile:NDKUserProfile = {}
        if (this.editMode && this.editProfile) profile = this.editProfile
        else if (this.user && this.user.profile) profile = this.user.profile

        const container = $("#UserProfileInfo")
        container.empty()
        container.html(ProfileHTML)

        const V = (element: JQuery<HTMLElement>, member: string, value: any) => {
            if (member == "created_at" || member == "cachedAt") {
                if (typeof value == "number")  element.text(FormattedTime(value))
            } else {
                if (JTagName(element) == "img") {
                    element.prop("src", value)
                } else {
                    if (typeof value == "string") {
                        const link = CreateLink(value)
                        if (link) {
                            element.append(link)
                        } else {
                            MakeCopyable(element, value)
                            if (value && member == "nip05") {
                                //console.debug("Nip-05 validation for", value)
                                this.user.validateNip05(value).then((valid) => {
                                    if (valid) {
                                        element.parent().prop("title", "Valid").find(".Valid").show()
                                    }
                                    else  element.parent().prop("title", "Invalid!").find(".Invalid").show()
                                })
                            }
                        }
                    }
                }
            }
        }

        const P = (element: JQuery<HTMLElement>, member: string) => {
            let value
            if (profile[member])
                value = profile[member]
            V(element, member, value)
            let dd = element
            while (JTagName(dd) != "dd") dd = dd.parent()
            dd.attr("tag", member)
            return element
        }

        const s = this.GuiSelectors
        MakeCopyable($(s.Pubkey), this.user.pubkey)
        MakeCopyable($(s.NPub), this.user.npub)
        MakeCopyable($(s.NProf), this.user.nprofile)
        P($(s.CreatedAt), "created_at")
        P($(s.CachedAt), "cachedAt")
        P($(s.Name), "name")
        P($(s.DisplayName), "displayName")
        P($(s.Picture), "picture")
        P($(s.Banner), "banner")
        P($(s.Nip05), "nip05")
        P($(s.Lud06), "lud06")
        P($(s.Lud16), "lud16")
        P($(s.About), "about")
        P($(s.Website), "website")

        if (this.user.profile) {
            const pinfo = $(s.Profile).find("dl.Info")
            for (const [field, value] of Object.entries(this.user.profile)) {
                if (!this.StandardMembers.has(field)) {
                    //console.debug("Profile.additional:", field, value)
                    $(s.Additional).show()
                    this.guiCustomField(field, `${value}`)
                }
            }
        }

        if (this.user.profile) {
            const jre = this.user.profile?.profileEvent
            if (jre) {
                const e = JSON.parse(jre)
                console.debug(e.tags)
                e.tags.forEach((tag: string[]) => {
                    let name = tag[0]
                    if (name == "display_name")  name = "displayName"
                    if (name && this.user.profile[name]) {
                        let value = tag[1]
                        if (this.user.profile[name] == value) {
                            //console.debug("Value already existing in profile:", name, value)
                            return
                        }
                        const dd = $(`dd[tag='${name}']`)
                        //console.debug("Element for tag", name, dd)
                        let div = $("<div>")
                        let v = div
                        if (name == "nip05") {
                            div = $(s.Nip05).parent().clone()
                            div.prop("id", null)
                            v = div.find("span.Value")
                        }
                        V(v, name, value)
                        dd.append(div)
                    } else {
                        console.debug("Tag not existing in profile:", name)
                    }
                })
            }
        }

        $("#UserProfileEdit").show().click(() => { this.edit() })
        $("#UserProfileRelaysButton").click(() => {
            if (this.event) {
                const relays = this.event.onRelays
                const d = $("#UserProfileRelaysDialog")
                const ul = d.find("ul")
                ul.empty()
                relays.forEach((relay) => {
                    const li = $("<li>")
                    li.text(relay.url)
                    ul.append(li)
                })
                const c = d.find("button")
                c.click(() => { d.prop("open", false) })
                d.prop("open", true)
            }
        })
    }

    apply(): boolean {
        function From(selector: string): string {
            const f = $(selector).parent()
            const i = f.find(".Input")
            return i.val()
        }

        if (!this.editProfile) {
            console.warn("No edit profile to save!")
            return false
        }
        const s = this.GuiSelectors
        this.editProfile.name = From(s.Name)
        this.editProfile.displayName = From(s.DisplayName)
        this.editProfile.picture = From(s.Picture)
        this.editProfile.banner = From(s.Banner)
        this.editProfile.nip05 = From(s.Nip05)
        this.editProfile.lud06 = From(s.Lud06)
        this.editProfile.lud16 = From(s.Lud16)
        this.editProfile.about = From(s.About)
        this.editProfile.website = From(s.Website)
        //console.debug("Profile about:", this.user.profile.about)

        const info = $("#UserProfileInfo")
        const inputs = info.find(".Input")
        inputs.each((index, input) => {
            if (!this.editProfile)  return
            input = $(input)
            const name = input.prop("name")
            if (!name)  return
            this.editProfile[name] = input.val()
        })

        return true
    }

    preview() {
        this.apply()
        this.guiShow()
    }

    async save() {
        if (!this.user) throw Error("No user defined!")
        if (!this.apply())  return

        if (this.editProfile) this.user.profile = this.editProfile
        try {
            const relays = await this.publishProfile(this.user)
            this.editMode = false
            App.get().user.navigate()
        } catch(error) {
            this.error(error)
        }
    }

    guiFillEditor() {
        if (!this.editProfile)  {
            console.warn("Cannot fill editor: no profile to edit!")
            return
        }

        function Text(selector: string) {
            const v = $(selector)
            //const v = f.find(".Value")
            const i = v.parent().find(".Input")
            i.val(v.text())
            v.hide()
            i.show()
        }
        function Img(selector: string) {
            const img = $(selector)
            const i = img.parent().find("input")
            //const img = f.find("img")
            i.val(img.prop("src"))
            img.hide()
            i.show()
        }

        const s = this.GuiSelectors
        Text(s.Name)
        Text(s.DisplayName)
        Img(s.Picture)
        Img(s.Banner)
        Text(s.Nip05)
        Text(s.Lud06)
        Text(s.Lud16)
        Text(s.About)
        Text(s.Website)

        function E(field: string) {
            const dd = $(`#UserProfileField${field}`)
            const v = dd.find(".Value")
            const i = dd.find(".Input")
            i.val(v.text())
            v.hide()
            i.show()
        }

        for (const [name, value] of Object.entries(this.user.profile)) {
            if (!this.StandardMembers.has(name)) {
                E(name)
            }
        }

        const pub = $("#UserProfilePublish")
        pub.click(() => {
            this.save()
        })
        pub.show()
        $("#UserProfileEdit").hide()
        const pp = $("#UserProfilePreview")
        pp.click(() => { this.preview() })
        pp.show()
        const ee = $("#UserProfileExitEdit")
        ee.click(() => {
            this.editMode = false
            this.guiShow()
        })
        ee.show()
        const nf = $("#UserProfileNewField")
        const i = nf.find("input")
        const b = nf.find("button")
        b.click(() => {
            const v = i.val()
            if (!v || !this.user || !this.user.profile)  return
            this.guiCustomField(v)
            E(v)
        })
        nf.show()
    }

    edit() {
        if (!this.checkProfile())  return
        this.editMode = true
        if (this?.user?.profile) this.editProfile = Object.create(this.user.profile)
        else this.editProfile = {}
        this.guiFillEditor()
    }

    checkProfile(): boolean {
        return !!(this.user && this.user.profile)
    }
}
