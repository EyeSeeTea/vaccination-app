// @ts-ignore
import { generateUid as d2GenerateUid } from "d2/uid";

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

export function generateUid() {
    return d2GenerateUid();
}
