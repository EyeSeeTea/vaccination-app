export function assert<T>(value: T | null | undefined, message?: string): T {
    if (value === null || value === undefined) {
        // eslint-disable-next-line no-debugger
        debugger;
        throw new Error(message || "Assertion failed");
    }
    return value;
}

export function assertNonEmpty<T>(array: T[], message?: string): T[] {
    if (array.length === 0) {
        throw new Error(message || "Assertion failed: array is empty");
    }
    return array;
}
