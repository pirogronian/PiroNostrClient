
import NDK, { NDKUser, NDKNip07Signer } from "@nostr-dev-kit/ndk";

const SIGNER_KEY = "SIGNER"
const NIP07 = "nip07"
const PIVATEKEY = "privatekey"

export class User {
    ndk: NDK

    constructor(ndk: NDK) {
        this.ndk = ndk
    }

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
        localStorage.setItem(SIGNER_KEY, NIP07)
    }

    logout() {
        this.ndk.signer = undefined
        localStorage.removeItem(SIGNER_KEY)
    }
}
