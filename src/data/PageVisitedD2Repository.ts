import { PageVisitedRepository } from "../domain/repositories/PageVisitedRepository";
import { Store } from "@dhis2/d2-ui-core";
import { D2Api } from "../types/d2-api";
import { isTestEnv } from "../utils/dhis2";

const cache = Store.create();

type StoreMapping = Record<string, boolean>;

export class PageVisitedD2Repository implements PageVisitedRepository {
    constructor(
        private api: D2Api,
        private options: { dataStoreNamespace: string; dataStoreKey: string }
    ) {}

    async markAsVisited(pageKey: string): Promise<{ previousValue: boolean }> {
        const { api } = this;
        const namespace = this.options.dataStoreNamespace;
        const storeKey = this.options.dataStoreKey;
        const state = (cache.getState() || {}) as StoreMapping;
        const fullKey = namespace + "-" + pageKey;

        if (isTestEnv()) {
            return { previousValue: true };
        } else if (state[fullKey]) {
            return { previousValue: true };
        } else {
            // Refactor to use d2-api userDataStore (+ entity PageVisited, useCase, repo, ...)
            const dataStore = api.userDataStore(namespace);
            const pagesVisited = (await dataStore.get<StoreMapping>(storeKey).getData()) || {};
            const visited = !!pagesVisited[pageKey];
            if (!visited) {
                const mapUpdated: typeof pagesVisited = { ...pagesVisited, [pageKey]: true };
                await dataStore.save(storeKey, mapUpdated).getData();
            }
            cache.setState({ ...state, [fullKey]: true });
            return { previousValue: visited };
        }
    }
}
