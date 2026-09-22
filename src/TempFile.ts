
export class TempFile {
    mime: string = "text/plain"
    data: string = ""

    writeLine(line: string) {
        this.data = `${this.data}${line}\n`
    }

    save(name: string) {
        const blob = new Blob([this.data], { type: this.mime })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = name
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }
}

