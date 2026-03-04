export interface CampaignQuery {
    list(options: CampaignQueryListOptions): Promise<ListResult>;
}

export type CampaignQueryListOptions = {
    filters: Filters;
    pagination: Pagination;
};

export type CampaignSummary = {
    id: string;
    name: string;
    displayName: string;
    displayDescription: string;
    created: string;
    lastUpdated: string;
    publicAccess: string;
    user: { id: string };
    href: string;
    organisationUnits: Array<{ id: string; path: string }>;
    // TODO: Convert to domain concepts (startDate, endDate)
    dataInputPeriods: Array<{ period: { id: string } }>;
    // TODO: Remove
    attributeValues: Array<{ value: string; attribute: { code: string } }>;
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
