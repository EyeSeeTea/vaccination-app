import {
    CampaignQuery,
    CampaignSummary,
    Filters,
    ListResult,
    Pagination,
} from "../domain/queries/CampaignQuery";
import { MetadataConfig } from "../models/config";
import { list } from "../models/datasets";
import DbD2 from "../models/db-d2";

export class CampaignD2Query implements CampaignQuery {
    constructor(private config: MetadataConfig, private db: DbD2) {}

    async list(options: { filters: Filters; pagination: Pagination }): Promise<ListResult> {
        return list(this.config, this.db.d2, options.filters, options.pagination);
    }
}
