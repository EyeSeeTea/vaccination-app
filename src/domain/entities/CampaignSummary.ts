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
    period: { start: string; end: string } | undefined; // "YYYY-MM-DD" format
};
