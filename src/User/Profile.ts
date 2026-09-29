
import $ from "jquery"

import { NDKUser } from "@nostr-dev-kit/ndk";

import { MakeCopyable, FormattedTime } from "@/various.js";

import { Module } from "@/Module.js";
import { App } from "@/App.js"

export class Profile extends Module {
    user: NDKUser|undefined

    readonly GuiSelectors = {
        Pubkey: "#UserPubkey",
        NPub: "#UserNPub",
        NProf: "#UserNProfile",
        CreatedAt: "#UserCreatedAt",
        Name: "#UserName span.Value",
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
        const unn = $(s.Name).text(this.user.profile?.name)
        const udnn = $("#UserDisplayName span.Value").text(this.user.profile?.displayName)
        const upictn = $("#UserPicture")
        const ubannern = $("#UserBanner")
        const ubion = $("#UserBio span.Value").text(this.user.profile?.bio)
        const unip05n = MakeCopyable($("#UserNip05 span.Value"), this.user.profile?.nip05)
        const ulud06n = MakeCopyable($("#UserLud06 span.Value"), this.user.profile?.lud06)
        const ulud16n = MakeCopyable($("#UserLud16 span.Value"), this.user.profile?.lud16)
        const uan = $("#UserAbout span.Value").text(this.user.profile?.about)
        const uwebn = $("#UserWebsite a")

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

        $("#UserProfile").show()
    }
}
