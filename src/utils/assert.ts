export function assert<T>(value: T | null | undefined, message?: string): T {
    if (value === null || value === undefined) {
        // eslint-disable-next-line no-debugger
        debugger;
        throw new Error(message || "Assertion failed");
    }
    return value;
}

export function assertValue<T>(value: T, msg?: string): asserts value is NonNullable<T> {
    if (value === null || value === undefined) {
        throw new Error(msg || "Value must not be null or undefined");
    }
}

export function assertCondition(condition: unknown, message?: string): void {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

export function assertNonEmpty<T>(array: T[], message?: string): T[] {
    if (array.length === 0) {
        throw new Error(message || "Assertion failed: array is empty");
    }
    return array;
}

export function throw_(error: Error): never {
    throw error;
}
