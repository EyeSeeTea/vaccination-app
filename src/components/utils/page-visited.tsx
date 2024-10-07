import React from "react";
import { D2 } from "../../models/d2.types";
import { DataStore } from "../../models/DataStore";
import { Maybe } from "../../models/db.types";
import { isTestEnv } from "../../utils/dhis2";
const { Store } = require("@dhis2/d2-ui-core");

type SetComplement<A, A1 extends A> = A extends A1 ? never : A;
type Subtract<T extends T1, T1 extends object> = Pick<T, SetComplement<keyof T, keyof T1>>;

interface PageVisitedParentProps {
    d2: D2;
}

export interface PageVisitedProps extends PageVisitedParentProps {
    pageVisited: Maybe<boolean>;
}

interface PageVisitedState {
    pageVisited: Maybe<boolean>;
}

const storeKey = "pages-visited";

const cache = Store.create();

export function withPageVisited<T extends PageVisitedProps>(
    Component: React.ComponentType<T>,
    storeNamespace: string,
    pageKey: string
) {
    return class extends React.Component<
        PageVisitedParentProps & Subtract<T, PageVisitedProps>,
        PageVisitedState
    > {
        state: PageVisitedState = {
            pageVisited: undefined,
        };

        async componentDidMount() {
            const storeKey = pageKey || Component.name;
            const visited = await getVisitedAndUpdate(this.props.d2, storeNamespace, storeKey);
            this.setState({ pageVisited: visited });
        }

        public render() {
            return <Component {...(this.props as T)} pageVisited={this.state.pageVisited} />;
        }
    };
}

export async function getVisitedAndUpdate(
    d2: D2,
    storeNamespace: string,
    pageKey: string
): Promise<boolean> {
    const state = cache.getState() || {};
    const fullKey = storeNamespace + "-" + pageKey;

    if (isTestEnv()) {
        return true;
    } else if (state[fullKey]) {
        return true;
    } else {
        const { baseUrl } = d2.Api.getApi();
        const dataStore = new DataStore(baseUrl, "user", storeNamespace);
        const pagesVisited = (await dataStore.get<_.Dictionary<boolean>>(storeKey)) || {};
        const visited = !!pagesVisited[pageKey];
        if (!visited) {
            dataStore.set(storeKey, { ...pagesVisited, [pageKey]: true });
        }
        cache.setState({ ...state, [fullKey]: true });
        return visited;
    }
}
