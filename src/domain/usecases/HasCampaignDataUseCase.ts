import { CampaignRepository } from "../repositories/CampaignRepository";

export class HasCampaignDataUseCase {
    constructor(private repositories: { campaignRepository: CampaignRepository }) {}

    execute(campaignId: string): Promise<boolean> {
        return this.repositories.campaignRepository.hasDataValues(campaignId);
    }
}
