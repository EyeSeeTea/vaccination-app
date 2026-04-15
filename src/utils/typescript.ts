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

type SetComplement<A, A1 extends A> = A extends A1 ? never : A;

/* Subtracts the keys of T1 from T, resulting in a type that has all the properties of
    T except those that are also in T1.

    Example:
    type A = { a: number; b: string; c: boolean };
    type B = { b: string };
    type Result = Subtract<A, B>;
    // Resulting type is { a: number; c: boolean }
*/
export type Subtract<T extends T1, T1 extends object> = Pick<T, SetComplement<keyof T, keyof T1>>;
