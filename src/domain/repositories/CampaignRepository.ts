import Campaign from "../../models/campaign";
import { Response } from "../../models/db.types";

export interface CampaignRepository {
    get(id: string): Promise<Campaign>;
    save(campaign: Campaign): Promise<Response<string>>;
}
