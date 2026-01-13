import { CampaignRepository } from "../domain/repositories/CampaignRepository";
import Campaign from "../models/campaign";
import CampaignDb from "../models/CampaignDb";
import { MetadataConfig } from "../models/config";
import DbD2 from "../models/db-d2";
import { Response } from "../models/db.types";
import { CampaignD2Get } from "./CampaignD2Get";

export class CampaignD2Repository implements CampaignRepository {
    constructor(private config: MetadataConfig, private db: DbD2) {}

    async get(id: string): Promise<Campaign> {
        return new CampaignD2Get(this.config, this.db).execute(id);
    }

    async save(campaign: Campaign): Promise<Response<string>> {
        return new CampaignDb(campaign).save();
    }
}
