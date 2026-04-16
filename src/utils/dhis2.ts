import md5 from "md5";

export function isTestEnv() {
    return !!process.env.CYPRESS_E2E;
}

// DHIS2 UID :: /^[a-zA-Z][a-zA-Z0-9]{10}$/
const asciiLetters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const asciiNumbers = "0123456789";
const asciiLettersAndNumbers = asciiLetters + asciiNumbers;
const range10 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const uidStructure = [asciiLetters, ...range10.map(() => asciiLettersAndNumbers)];
const maxHashValue = uidStructure.map(cs => cs.length).reduce((acc, n) => acc * n, 1);

/* Return pseudo-random UID from seed prefix/key */
export function getUid(...values: string[]): string {
    const seed = values.join("");
    const md5hash = md5(seed);
    const nHashChars = Math.ceil(Math.log(maxHashValue) / Math.log(16));
    const hashInteger = parseInt(md5hash.slice(0, nHashChars), 16);
    const result = uidStructure.reduce(
        (acc, chars) => {
            const { n, uid } = acc;
            const nChars = chars.length;
            const quotient = Math.floor(n / nChars);
            const remainder = n % nChars;
            const uidChar = chars[remainder];
            return { n: quotient, uid: uid + uidChar };
        },
        { n: hashInteger, uid: "" }
    );

    return result.uid;
}
