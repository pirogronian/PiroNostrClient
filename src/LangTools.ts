
import { Langs } from "langs"
import { parse as bcp47parse } from "bcp-47"
import LTags from "language-tags"
//import FullLangList from 'cldr/likelySubtags'
import LikelySubtagsData from 'cldr-core/supplemental/likelySubtags.json?raw';
import ParentLocalesData from "cldr-core/supplemental/parentLocales.json?raw";

import { TempFile } from "@/TempFile.js"

export namespace LangTools {
    export const Standards = {
        ISO639_1: "ISO-639-1",
        ISO639_3: "ISO-639-3",
        BCP47: "BCP47",
        Auto: null
    } as const;

    export type StandardType = (typeof Standards)[keyof typeof Standards];

    export function isValid(code: string, standard: StandardType): boolean {
        switch(standard) {
            case Standards.ISO639_1:
                return Langs.where("1", code)
            case Standards.ISO639_3:
                return Langs.where("3", code)
            case Standards.BCP47:
                const schema = bcp47parse(code.trim())
                return !!schema.language
            default:
                return false
        }
    }

    export function detectStandard(code: string) {
        if (isValid(code, Standards.BCP47))  return Standards.BCP47
        if (isValid(code, Standards.ISO639_1))  return Standards.ISO639_1
        if (isValid(code, Standards.ISO639_3))  return Standards.ISO639_3
        
        return null
    }

    export function humanFormat(code: string, lang: string|undefined = undefined) {
        if (!lang)  lang = "en"
        let dnl
        try {
            dnl = new Intl.DisplayNames([lang], { type: "language" })
        } catch (error) {
            console.warn(error)
            return code
        }
        let ret
        try {
           ret = dnl.of(code)
        } catch(error) {
            console.warn(error)
        }
        if (ret == code || ret == code.toLocaleLowerCase()) {
            //console.debug("Output:", ret, ", probably not parsed.")
            const parsed = LTags(code)
            const lcode = parsed.language()?.format()
            const scode = parsed.script()?.format()
            const rcode = parsed.region()?.format()
            const desc = parsed.descriptions()[0]

            const dns = new Intl.DisplayNames([lang], { type: "script" })
            const dnr = new Intl.DisplayNames([lang], { type: "region" })

            let lname
            try {
                lname = lcode?dnl.of(lcode):null
            } catch (error) {
                console.warn(error)
                lname = lcode
            }
            let sname
            try {
                sname = scode?dns.of(scode):null
            } catch (error) {
                console.warn(error)
                sname = scode
            }
            let rname
            try {
                rname = rcode?dnr.of(rcode):null
            } catch (error) {
                console.warn(error)
                rname = rcode
            }

            ret = ""
            if (lname) ret = lname
            if (desc) {
                if (ret) ret = `${ret} `
                ret = `${ret}(${desc})`
            }
            if (sname) {
                if (ret) ret = `${ret} `
                ret = `${ret}- ${sname}`
                if (rname) ret = `${ret} -`
            }

            if (rname) {
                if (ret) ret = `${ret} `
                ret = `${ret}(${rname})`
            }
        }
        return ret
    }

    export function getCLDRLikelySubtags() {
        const object = JSON.parse(LikelySubtagsData)

        return object.supplemental.likelySubtags
    }

    export function getCLDRLangsParents() {
        const object = JSON.parse(ParentLocalesData)

        return object.supplemental.parentLocales.parentLocale
    }

    export function getSubtagsLangsList() {
        const alllist = LTags.search("")
        return alllist.filter((tag) => tag.type() === "language")                
    }

    export function getLangsList() {
        let ret: string[] = []

        const subtagsList = getSubtagsLangsList()
        const likelySubtags = getCLDRLikelySubtags()
        subtagsList.forEach((tag) => {
            ret.push(tag.data.subtag)
        })
        Object.keys(likelySubtags).forEach((key: string) => {
            if (!ret.includes(key))  ret.push(key)
        })
        const parents = getCLDRLangsParents()
        for (const child in parents) {
            const parent = parents[child]
            if (!ret.includes(child))  ret.push(child)
            if (!ret.includes(parent))  ret.push(parent)
        }
        ret.sort()

        return ret
    }
}
/*
const dns = new Intl.DisplayNames(["pl"], { type: "script" })
console.debug(dns.of("Latn"))

console.debug(LangTools.humanFormat("ztq-Latn-MX", "pl"))*/

function test(code: string) {
    console.debug(code, ":", LangTools.humanFormat(code, "pl"))
}
/*
const l = LangTools.getLangsList()
const f = new TempFile()
l.forEach((lang) => {
    const line = `${lang}: ${LangTools.humanFormat(lang, lang)}`
    f.writeLine(line)
})

f.save("FullLangList.txt")
*/
//test("az-Arab")
