
import ErrorHTML from './error.html?raw';

export async function safeAsync<T>(promise: Promise<T>): Promise<[Error | null, T | null]> {
    try {
        const data = await promise;
        return [null, data];
    } catch (err) {
        return [err as Error, null];
    }
}

export function ErrorMessage(msg : string) : void {
    const MWHtml = document.getElementById('MainView');
    MWHtml.innerHTML = ErrorHTML
    const msgdiv = MWHtml.querySelector('#ErrorMessage')
    msgdiv.innerText = msg
}
