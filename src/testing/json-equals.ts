export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

type JsonObject = { [key: string]: JsonValue };

// Deep by-value equality check for JSSON-compatible values
export function jsonEquals(a: JsonValue, b: JsonValue): boolean {
    // Fast path for strict equality
    if (a === b) return true;

    const typeA = getType(a);
    const typeB = getType(b);

    // Different types -> not equal
    if (typeA !== typeB) return false;

    // Both values have the same type: perform custom checks for each type
    switch (typeA) {
        // Primitive types comparable by value (already compared above, do it again for clarity)
        case "null":
        case "string":
        case "number":
        case "boolean":
            return a === b;
        case "array":
            return arrayEquals(a as JsonValue[], b as JsonValue[]);
        case "object":
            return objectEquals(a as JsonObject, b as JsonObject);
    }
}

function arrayEquals(arrayA: JsonValue[], arrayB: JsonValue[]): boolean {
    return (
        arrayA.length === arrayB.length && //
        arrayA.every((itemA, idx) => {
            return jsonEquals(itemA, arrayB[idx] as JsonValue);
        })
    );
}

function objectEquals(objA: JsonObject, objB: JsonObject): boolean {
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    return (
        keysA.length === keysB.length && //
        Object.entries(objA).every(([key, valueA]) => {
            return key in objB && jsonEquals(valueA, objB[key] as JsonValue);
        })
    );
}

// Get the type of a JsonValue (as defined in the JSON specification, not the quirky JS typeof)
function getType(value: JsonValue): "string" | "number" | "boolean" | "null" | "array" | "object" {
    const t = typeof value;

    if (value === null) {
        return "null";
    } else if (Array.isArray(value)) {
        return "array";
    } else if (t === "string" || t === "number" || t === "boolean" || t === "object") {
        return t;
    } else {
        throw new Error(`Invalid JsonValue type: ${typeof value}`);
    }
}
