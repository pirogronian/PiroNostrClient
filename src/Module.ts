
import Navigo from "navigo"
import { Router } from "./Router.js"

export class Module {
    _settingsName!: string
    _routingName!: string
    _parent: Module|undefined
    _settingsSeparator: string = "."
    _routingSeparator: string = "/"
    _settingsPath!:string
    _routingPath!:string
    router: Router|null = null
    

    settingsPath(path: string|undefined = undefined): string|void {
        if (path) {
            this._settingsPath = path
        } else {
            return this._settingsPath
        }
    }

    routingPath(path: string|undefined = undefined): string|void {
        if (path) {
            this._routingPath = path
        } else {
            return this._routingPath
        }
    }

    register(name: string, routingNane: string|null = null, parent: Module|undefined = undefined) {
        this._settingsName = name
        if (routingNane)
            this._routingName = routingNane
        else
            this._routingName = name
        this._parent = parent
        if (this._parent) {
            this._settingsPath = this._parent._settingsPath.concat(this._settingsSeparator).concat(this._settingsName)
            this._routingPath = this._parent._routingPath.concat(this._routingSeparator).concat(this._routingName)

            if (this._parent.router)
                this.router = this._parent.router
        }
    }

    settings(name: string, value: string|undefined|null = undefined): string|null|void {
        const ret: string|undefined = undefined
        const key = this._settingsPath.concat(this._settingsSeparator).concat(name)

        if (value) {
            return localStorage.setItem(key, value)
        }
        if (typeof value === "null") {
            return localStorage.removeItem(key)
        }
        return localStorage.getItem(key)
    }

    onRoute(pattern: string, f: Function) {
        this.router?.onRoute(this._routingPath.concat(pattern), f)
    }
}
