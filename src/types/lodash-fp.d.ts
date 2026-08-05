declare module "lodash/fp" {
    const fp: {
        set<T>(path: (string | number)[], value: unknown, obj: T): T;
    };
    export default fp;
}
