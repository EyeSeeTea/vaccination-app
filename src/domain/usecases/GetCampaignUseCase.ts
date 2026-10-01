import Campaign from "../../models/campaign";
import { CampaignRepository } from "../repositories/CampaignRepository";

export class GetCampaignUseCase {
    constructor(
        private repositories: {
            campaignRepository: CampaignRepository;
        }
    ) {}

    execute(campaignId: string): Promise<Campaign> {
        return this.repositories.campaignRepository.get(campaignId);
    }
}
