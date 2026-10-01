import React from "react";

import { Maybe } from "../../models/db.types";
import { CompositionRoot } from "../../CompositionRoot";
import { Subtract } from "../../utils/typescript";

interface PageVisitedParentProps {
    compositionRoot: CompositionRoot;
}

export interface PageVisitedProps extends PageVisitedParentProps {
    pageVisited: Maybe<boolean>;
}

interface PageVisitedState {
    pageVisited: Maybe<boolean>;
}

export function withPageVisited<Props extends PageVisitedProps>(
    Component: React.ComponentType<Props>,
    pageKey: string
) {
    return class extends React.Component<
        PageVisitedParentProps & Subtract<Props, PageVisitedProps>,
        PageVisitedState
    > {
        state: PageVisitedState = {
            pageVisited: undefined,
        };

        async componentDidMount() {
            const storeKey = pageKey || Component.name;
            const res = await this.props.compositionRoot.pages.markAsVisited.execute(storeKey);
            this.setState({ pageVisited: res.previousValue });
        }

        public render() {
            return <Component {...(this.props as Props)} pageVisited={this.state.pageVisited} />;
        }
    };
}
