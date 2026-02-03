/* Utility types for TypeScript */

/* A tuple type representing a pair consisting of a key of T and its corresponding value type 

Typically used as the return value of the block building pairs to be convert to object. Example

type ResType = Record<string, number>;

const obj = _(["a", "b", "c"])
    .map((s): PairOf<ResType> => [s, s.length])
    .fromPairs()
    .value(); // Resulting type is Record<string, number>
*/
export type PairOf<T> = [keyof T, T[keyof T]];
