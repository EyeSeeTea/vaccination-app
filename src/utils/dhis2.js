import md5 from "md5";

function getCurrentUserSymbol(d2, symbolName, defaultValue) {
    const { currentUser } = d2;
    const symbol = Object.getOwnPropertySymbols(currentUser).find(
        symbol => symbol.toString() === `Symbol(${symbolName})`
    );

    if (!symbol || !currentUser[symbol]) {
        console.error(`Cannot get symbol for current user: ${symbolName}`);
        return defaultValue;
    } else {
        return currentUser[symbol];
    }
}

export function getCurrentUserRoles(d2) {
    return getCurrentUserSymbol(d2, "userRoles", []);
}

export function getCurrentUserDataViewOrganisationUnits(d2) {
    return getCurrentUserSymbol(d2, "dataViewOrganisationUnits", []);
}

export function isTestEnv() {
    return !!process.env.REACT_APP_CYPRESS;
}

// DHIS2 UID :: /^[a-zA-Z][a-zA-Z0-9]{10}$/
const asciiLetters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const asciiNumbers = "0123456789";
const asciiLettersAndNumbers = asciiLetters + asciiNumbers;
const range10 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const uidStructure = [asciiLetters, ...range10.map(() => asciiLettersAndNumbers)];
const maxHashValue = uidStructure.map(cs => cs.length).reduce((acc, n) => acc * n, 1);

/* Return pseudo-random UID from seed prefix/key */
export function getUid(prefix, key) {
    const seed = prefix + key;
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
