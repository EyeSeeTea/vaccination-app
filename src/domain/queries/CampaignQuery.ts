import { CampaignSummary } from "../entities/CampaignSummary";

export interface CampaignQuery {
    list(options: CampaignQueryListOptions): Promise<ListResult>;
}

export type CampaignQueryListOptions = {
    filters: Filters;
    pagination: Pagination;
};

export type Filters = {
    search?: string;
};

export type Pagination = {
    page?: number;
    pageSize?: number;
    sorting?: [string, "asc" | "desc"];
};

export type ListResult = {
    pager: { page: number; total: number };
    objects: CampaignSummary[];
};
