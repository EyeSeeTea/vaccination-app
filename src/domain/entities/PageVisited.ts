import { Struct } from "../../models/Struct";

type PageVisitedAttrs = {
    page: string;
    visited: boolean;
};

export class PageVisited extends Struct<PageVisitedAttrs>() {}
