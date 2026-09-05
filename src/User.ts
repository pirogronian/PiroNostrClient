
import NDK, { NDKUser } from "@nostr-dev-kit/ndk";

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
