
import NDK, { NDKUser } from "@nostr-dev-kit/ndk";

function DisplayUserInfo(user: NDKUser | null) : void {
    const UserHTML = document.getElementById("LoggedUser")
    const NickHtml = document.getElementById("LoggedUserNick")
    const PubkeyHtml = document.getElementById("LoggedUserPubkey")
    if (user) {
        UserHTML.style.display = "block"
        NickHtml.innerText = user.profile?.name || user.profile?.displayName || ""
        PubkeyHtml.innerText = user.pubkey
    } else {
        UserHTML.style.display = "none"
        NickHtml.innerText = ""
        PubkeyHtml.innerText = ""
    }
}

export class User {
    ndk: NDK

    constructor(ndk: NDK) {
        this.ndk = ndk
    }

    async get() : Promise<NDKUser|null> {
        let user : NDKUser | null = null
        if (this.ndk.signer) {
            user = await this.ndk.signer.user()
            if (user) {
                console.log("Fetching profile...")
                await user.fetchProfile({
                    closeOnEose: true,
                    groupable: false
                })
            }
        }
        return user
    }
}

export async function UpdateUserInfo(ndk: NDK) : Promise<void> {
    let user : NDKUser | null = null
    if (ndk.signer) {
        user = await ndk.signer.user()
        if (user) {
            console.log("Fetching profile...")
            user.fetchProfile({
                closeOnEose: true,
                groupable: false
            }).then((profile) => {/*
                console.log("Printing profile...")
                if (user?.profile) {
                    console.log("Pełny obiekt profilu:", user.profile);
  
                    Object.entries(user.profile).forEach(([key, value]) => {
                        console.log(`${key}:`, value);
                    });
                }*/
            })
        }
    }
    DisplayUserInfo(user)
}
