
import $, { type JQuery } from "jquery"

import { NDKEvent, NDKUser, type NDKUserProfile } from "@nostr-dev-kit/ndk";

import { MakeCopyable, FormattedTime, CreateLink, JTagName } from "@/various.js";

import { Module } from "@/Module.js";
import { App } from "@/App.js"

import ProfileHTML from "./Profile.html?raw"

export class Profile extends Module {
    user: NDKUser|undefined

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
        Bio: "#UserBio span.Value",
        Nip05: "#UserNip05 span.Value",
        Lud06: "#UserLud06 span.Value",
        Lud16: "#UserLud16 span.Value",
        About: "#UserAbout span.Value",
        Website: "#UserWebsite .Value"
    }

    guiShow() {
        if (!this.user) {
            console.warn("No user to show profile for!")
            return
        }

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
            if (this.user && this.user.profile && this.user.profile[member])
                value = this.user.profile[member]
            V(element, member, value)
            let dd = element
            while (JTagName(dd) != "dd") dd = dd.parent()
            dd.attr("tag", member)
            return element
        }

        const s = this.GuiSelectors
        const upkn = MakeCopyable($(s.Pubkey), this.user.pubkey)
        const unpn = MakeCopyable($(s.NPub), this.user.npub)
        const unprn = MakeCopyable($(s.NProf), this.user.nprofile)
        P($(s.CreatedAt), "created_at")
        P($(s.CachedAt), "cachedAt")
        P($(s.Name), "name")
        P($(s.DisplayName), "displayName")
        P($(s.Picture), "picture")
        P($(s.Banner), "banner")
        P($(s.Bio), "bio")
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
                    const keyNode = $("<dt>")
                    keyNode.text(field)
                    const valNode = $("<dd>")
                    if (typeof value == "string") {
                        const link = CreateLink(value)
                        if (link) {
                            valNode.append(link)
                        } else  MakeCopyable(valNode, value)
                    }
                    else valNode.text(`${value}`)
                    pinfo.append(keyNode)
                    pinfo.append(valNode)
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
                    if (name && this.user?.profile[name]) {
                        let value = tag[1]
                        if (this.user?.profile[name] == value) {
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

        $(s.Profile).show()
    }

    
}
