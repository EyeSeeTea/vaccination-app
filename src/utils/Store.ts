/**
 * Generic store that holds a single state value.
 *
 * @example
 * ```typescript
 * type MyState = { key: string };
 * const store = Store.create<MyState>();
 * store.setState({ key: 'value' });
 * const state = store.getState(); // state is { key: 'value' }
 * ```
 */
export class Store<T> {
    private state: T | undefined;

    static create<T>(): Store<T> {
        return new Store<T>();
    }

    getState(): T | undefined {
        return this.state;
    }

    setState(state: T): void {
        this.state = state;
    }
}
