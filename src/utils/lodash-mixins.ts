import _ from "lodash";

declare module "lodash" {
    interface LoDashStatic {
        getOrFail<TObject extends object, TKey extends keyof TObject>(
            object: TObject | null | undefined,
            path: TKey | [TKey]
        ): TObject[TKey];
        cartesianProduct<T>(arr: T[][]): T[][];

        isNotEmpty(value?: any): boolean;
    }

    interface LoDashImplicitWrapper<TValue> {
        getOrFail<TObject extends object, TKey extends keyof TObject>(
            this: LoDashImplicitWrapper<TObject | null | undefined>,
            path: TKey | [TKey]
        ): TObject[TKey];

        isNotEmpty(): boolean;

        _placeholder: TValue;
    }
}

export function cartesianProduct<T>(arr: T[][]): T[][] {
    return arr.reduce(
        (a, b) => {
            return a
                .map(x => {
                    return b.map(y => {
                        return x.concat(y);
                    });
                })
                .reduce((c, d) => c.concat(d), []);
        },
        [[]] as T[][]
    );
}

function getOrFail(obj: any, key: string | number): any {
    const value = _.get(obj, key);
    if (value === undefined) {
        const maxKeys = 20;
        const keys = _.keys(obj);
        const availableKeys = [
            _.take(keys, maxKeys).join(", "),
            keys.length > maxKeys ? ` ... and ${keys.length} more` : "",
        ].join("");
        throw new Error(`Key '${key}' not found: ${availableKeys}`);
    } else {
        return value;
    }
}

function isNotEmpty(obj: any): boolean {
    return !_.isEmpty(obj);
}

_.mixin({
    cartesianProduct: cartesianProduct,
});

_.mixin({ getOrFail, isNotEmpty }, { chain: false });

export function cartesianProduct2<T1, T2>(groups: [T1[], T2[]]): Array<[T1, T2]> {
    const [group1, group2] = groups;
    const result: Array<[T1, T2]> = [];

    for (const a of group1) {
        for (const b of group2) {
            result.push([a, b]);
        }
    }

    return result;
}

// Generate the power set of an array
// E.g., powerSet([1,2,3]) => [[], [1], [2], [3], [1,2], [1,3], [2,3], [1,2,3]]
export function powerSet<T>(array: T[]): T[][] {
    return _.reduce(
        array,
        (subsets: T[][], value: T) => {
            const withValue = subsets.map(subset => [...subset, value]);
            return [...subsets, ...withValue];
        },
        [[]] as T[][] // start with the empty set
    );
}

type Zipped<T extends unknown[][]> = {
    [K in keyof T]: T[K] extends (infer U)[] ? U : never;
};

export function zipShortest<T extends unknown[][]>(...arrays: T): Zipped<T>[] {
    if (arrays.length === 0) return [];

    const minLen = Math.min(...arrays.map(a => a.length));
    const result: Zipped<T>[] = [];

    for (let i = 0; i < minLen; i++) {
        // We know i < length of every array, so arr[i] is safe.
        // TS can’t prove it, so we cast the row.
        const row = arrays.map(arr => arr[i] as unknown) as Zipped<T>;
        result.push(row);
    }

    return result;
}

export function fromPairs<K extends string | number | symbol, V>(
    pairs: Array<[K, V]>
): Record<K, V> {
    const result: Record<K, V> = {} as Record<K, V>;
    for (const [key, value] of pairs) {
        result[key] = value;
    }
    return result;
}
