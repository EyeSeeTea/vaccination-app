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

function cartesianProduct<T>(arr: T[][]): T[][] {
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

_.mixin({ cartesianProduct });

_.mixin({ getOrFail, isNotEmpty }, { chain: false });
