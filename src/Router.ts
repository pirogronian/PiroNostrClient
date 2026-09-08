
import Navigo from 'navigo'

export class Router {
    _navigo: Navigo

    constructor(base: string = "/") {
        this._navigo = new Navigo(base, { hash: true, strategy: Navigo.ONE })
    }

    onRoute(route: string, f: Function): void {
        this._navigo.on(route, f, { already: f })
    }

    navigate(path: string) {
        const cleanPath = "#".concat(path.startsWith("/") ? path : "/" + path);
        if (window.location.hash == cleanPath) {
            console.log("Router.navigate manually: ", cleanPath)
            this._navigo.resolve()
        }
        else
        {
            console.log("Router.navigate auto: ", cleanPath)
            window.location.hash = cleanPath;
        }
    }

    hooks(h): void {
        this._navigo.hooks(h)
    }

    resolve() {
        this._navigo.resolve()
    }
}

