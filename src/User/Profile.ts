
import $ from "jquery"

import { NDKUser, type NDKUserProfile } from "@nostr-dev-kit/ndk";

import { MakeCopyable, FormattedTime, CreateLink } from "@/various.js";

import { Module } from "@/Module.js";
import { App } from "@/App.js"

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
        Picture: "#UserPicture",
        Banner: "#UserBanner",
        Bio: "#UserBio span.Value",
        Nip05: "#UserNip05 span.Value",
        Lud06: "#UserLud06 span.Value",
        Lud16: "#UserLud16 span.Value",
        About: "#UserAbout span.Value",
        Website: "#UserWebsite a"
    }

    guiShow() {
        if (!this.user) {
            console.warn("No user to show profile for!")
            return
        }
        const s = this.GuiSelectors
        const upkn = MakeCopyable($(s.Pubkey), this.user.pubkey)
        const unpn = MakeCopyable($(s.NPub), this.user.npub)
        const unprn = MakeCopyable($(s.NProf), this.user.nprofile)
        const ca = $(s.CreatedAt).text(FormattedTime(this.user.profile?.created_at))
        if (typeof this.user.profile?.cachedAt == "number") $(s.CachedAt).text(FormattedTime(this.user.profile?.cachedAt))
        const unn = $(s.Name).text(this.user.profile?.name)
        const udnn = $(s.DisplayName).text(this.user.profile?.displayName)
        const upictn = $(s.Picture)
        const ubannern = $(s.Banner)
        const ubion = $(s.Bio).text(this.user.profile?.bio)
        const unip05n = MakeCopyable($(s.Nip05), this.user.profile?.nip05)
        const ulud06n = MakeCopyable($(s.Lud06), this.user.profile?.lud06)
        const ulud16n = MakeCopyable($(s.Lud16), this.user.profile?.lud16)
        const uan = $(s.About).text(this.user.profile?.about)
        const uwebn = $(s.Website)

        if (this.user.profile?.picture) upictn.find("img").prop("src", this.user.profile?.picture)
        if (this.user.profile?.banner) ubannern.find("img").prop("src", this.user.profile?.banner)
        if (this.user.profile?.nip05) {
            this.user.validateNip05(this.user.profile.nip05).then((valid) => {
                if (valid) {
                    unip05n.parent().prop("title", "Valid").find(".Valid").show()
                }
                else  unip05n.parent().prop("title", "Invalid!").find(".Invalid").show()
            })
        }
        uwebn.text(this.user.profile?.website).prop("href", this.user.profile?.website)

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

        $(s.Profile).show()
    }
}
