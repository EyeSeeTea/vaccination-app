import { CampaignQuery, CampaignQueryListOptions, ListResult } from "../queries/CampaignQuery";

export class ListCampaignsUseCase {
    constructor(private queries: { campaignQuery: CampaignQuery }) {}

    async execute(options: CampaignQueryListOptions): Promise<ListResult> {
        return this.queries.campaignQuery.list(options);
    }
}
