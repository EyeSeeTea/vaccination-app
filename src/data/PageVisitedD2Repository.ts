import { PageVisitedRepository } from "../domain/repositories/PageVisitedRepository";
import { Store } from "../utils/Store";
import { D2Api } from "../types/d2-api";
import { isTestEnv } from "../utils/dhis2";

type StoreMapping = Record<string, boolean>;

const cache = Store.create<StoreMapping>();

export class PageVisitedD2Repository implements PageVisitedRepository {
    constructor(
        private api: D2Api,
        private options: { dataStoreNamespace: string; dataStoreKey: string }
    ) {}

    async markAsVisited(pageKey: string): Promise<{ previousValue: boolean }> {
        const { api } = this;
        const namespace = this.options.dataStoreNamespace;
        const storeKey = this.options.dataStoreKey;
        const state = cache.getState() || {};
        const fullKey = namespace + "-" + pageKey;

        if (isTestEnv()) {
            return { previousValue: true };
        } else if (state[fullKey]) {
            return { previousValue: true };
        } else {
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
