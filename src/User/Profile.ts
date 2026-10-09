
import $, { type JQuery } from "jquery"

import { NDKEvent, NDKUser, type NDKUserProfile, type NostrEvent, profileFromEvent, serializeProfile } from "@nostr-dev-kit/ndk";

import { MakeCopyable, FormattedTime, CreateLink, JTagName } from "@/various.js";

import { Module } from "@/Module.js";
import { App } from "@/App.js"

import ProfileHTML from "./Profile.html?raw"

function E(field: string) {
    const dd = $(`#UserProfileField${field}`)
    const v = dd.find(".Value")
    const i = dd.find(".Input")
    i.val(v.text())
    v.hide()
    i.show()
}

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
        ProfileInfo: "#UserProfileInfo",
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

    guiNewValueNode(value: string) {
        const node = $("<div>")
        node.text(value)
        node.addClass("AdditionalProfileValue")
        node.addClass("RemovableItem")
        node.prop("title", "Click to remove")
        node.click(() => node.remove())
        return node
    }

    guiNewValueInputSetup(div: JQuery<HTMLElement>) {
        const input = div.find(".Input2")
        const button = div.find("button")
        const name = input.attr("name")
        //console.debug("New value input setup for:", name, div)
        button.click(() => {
            console.debug("Create new value:")
            if (!input.val())  return
            //console.debug(input.val())
            const nvn = this.guiNewValueNode(input.val())
            nvn.attr("name", name)
            div.parent().append(nvn)
        })
    }

    guiCustomField(name: string, value?: string) {
        const pinfo = $(`${this.GuiSelectors.ProfileInfo} > dl.Info`)
        const keyNode = $("<dt>")
        keyNode.text(name)
        const defNode = $("<dd>")
        const valNode = $("<div>")
        const iNode = $("<input>")
        const delB = $("<button>")
        defNode.prop("id", `UserProfileField${name}`)
        defNode.prop("name", name)
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
        delB.text("Delete")
        delB.addClass("UserProfileCustomFieldDelete")
        delB.click(() => {
            defNode.remove()
            keyNode.remove()
        })
        defNode.attr("name", name)
        defNode.append(valNode)
        defNode.append(iNode)
        defNode.append(delB)
        const nvni = $("<div>")
        nvni.addClass("UserProfileNewValue")
        nvni.prop("style", "display: none")
        const i = $("<textarea>")
        i.prop("name", name)
        i.addClass("Input2")
        const b = $("<button>")
        b.text("Add")
        /*b.click(() => {
            console.debug("Adding new value:", i.val())
            //console.debug(i)
            if (!i.val())  return
            const nvn = this.guiNewValueNode(i.val())
            console.debug(nvn)
            nvn.attr("name", name)
            nvni.parent().append(nvn)
        })*/
        nvni.append(i)
        nvni.append(b)
        defNode.append(nvni)
        //this.guiNewValueInputSetup(nvni)
        pinfo.append(defNode)
    }

    guiShow() {
        if (!this.user) {
            console.warn("No user to show profile for!")
            return
        }
        $("#UserProfileEdit").show()
        $("#UserProfilePreview").hide()
        $(".UserProfileNewValue").hide()
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
            for (const [field, value] of Object.entries(profile)) {
                if (!this.StandardMembers.has(field)) {
                    //console.debug("Profile.additional:", field, value)
                    $(s.Additional).show()
                    this.guiCustomField(field, `${value}`)
                }
            }
        }

        if (profile) {
            const jre = profile.profileEvent
            if (jre) {
                const e = JSON.parse(jre)
                console.debug(e.tags)
                e.tags.forEach((tag: string[]) => {
                    let name = tag[0]
                    if (name == "display_name")  name = "displayName"
                    if (name && profile[name]) {
                        let value = tag[1]
                        if (profile[name] == value) {
                            //console.debug("Value already existing in profile:", name, value)
                            return
                        }
                        const dd = $(`dd[name='${name}']`)
                        //console.debug("Element for tag", name, dd)
                        let div = $("<div>")
                        div.attr("name", name)
                        let v = div
                        if (name == "nip05") {
                            div = $(s.Nip05).parent().clone()
                            div.prop("id", null)
                            v = div.find("span.Value")
                        }
                        V(v, name, value)
                        div.addClass("AdditionalProfileValue")
                        dd.append(div)
                    } else {
                        console.debug("Tag not existing in profile:", name)
                    }
                })
            }
        }

        const nf = $("#UserProfileNewField")
        const i = nf.find("input")
        const b = nf.find("button")
        b.click(() => {
            const v = i.val()
            if (!v || !this.user || !this.user.profile)  return
            this.guiCustomField(v)
            E(v)
        })

        const nvs = $(".UserProfileNewValue")
        nvs.each((index, node) => {
            this.guiNewValueInputSetup($(node))
        })

        $(".UserProfileCustomFieldDelete").hide()
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
        //console.debug("Edit profile:", this.editProfile)

        const info = $("#UserProfileInfo")
        const inputs = info.find(".Input")
        inputs.each((index, input) => {
            if (!this.editProfile)  return
            input = $(input)
            const name = input.prop("name")
            if (!name)  return
            //console.debug(`Apply '${input.val()}' to '${name}'`)
            this.editProfile[name] = input.val()
        })

        this.editEvent = new NDKEvent(this.ndk)
        this.editEvent.kind = 0
        this.editEvent.content = serializeProfile(this.editProfile)

        const apvs = $(".AdditionalProfileValue")
        apvs.each((index, node) => {
            node = $(node)
            const name = node.attr("name")
            const value = node.text()
            console.debug(`Apply additional value: '${name}': '${value}'`)
            if (name && value) {
                this.editEvent?.tags.push([name, value])
            }
        })

        this.editProfile = profileFromEvent(this.editEvent)
        //console.debug("Applied profile:", this.editProfile)
        //if (this.editProfile.profileEvent)
            //console.debug("Profile event:", JSON.parse(this.editProfile.profileEvent))

        return true
    }

    preview() {
        console.debug("Preview:")
        this.apply()
        this.guiShow()
    }

    async save() {
        if (!this.user) throw Error("No user defined!")
        if (!this.apply())  return
        if (!this.editEvent)  return

        try {
            const relays = await this.publishEvent(this.editEvent)
            this.editMode = false
            if (!this.isCurrent())  return
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

        for (const [name, value] of Object.entries(this.user.profile)) {
            if (!this.StandardMembers.has(name)) {
                E(name)
            }
        }

        const apvs = $(".AdditionalProfileValue")
        apvs.each((index, node) => {
            node = $(node)
            node.addClass("RemovableItem")
            node.prop("title", "Click to remove")
            node.click(() => {
                node.remove()
            })
        })

        $(".UserProfileNewValue").show()

        $("#UserProfilePublish").show()
        $("#UserProfileEdit").hide()
        $("#UserProfilePreview").show()
        $("#UserProfileExitEdit").show()

        $("#UserProfileNewField").show()
        $(".UserProfileCustomFieldDelete").show()
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

    guiSetup() {
        $("#UserProfileEdit").click(() => { this.edit() })
        $("#UserProfilePreview").click(() => { this.preview() })
        $("#UserProfileExitEdit").click(() => {
            this.editMode = false
            this.guiShow()
        })
        $("#UserProfilePublish").click(() => {
            this.save()
        })

        const d = $("#UserProfileRelaysDialog")
        const c = d.find("button")
        c.click(() => { d.prop("open", false) })
        $("#UserProfileRelaysButton").click(() => {
            if (this.event) {
                const relays = this.event.onRelays
                const ul = d.find("ul")
                ul.empty()
                relays.forEach((relay) => {
                    const li = $("<li>")
                    li.text(relay.url)
                    ul.append(li)
                })
                d.prop("open", true)
            }
        })
    }
}
