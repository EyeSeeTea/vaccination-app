import { withPageVisited as withPageVisitedOriginal, PageVisitedProps } from "./page-visited";

export function withPageVisited<T extends PageVisitedProps>(
    Component: React.ComponentType<T>,
    key: string
) {
    return withPageVisitedOriginal(Component, key);
}
