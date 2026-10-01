import { CampaignRepository } from "../repositories/CampaignRepository";

export class GetCampaignUseCase {
    constructor(
        private repositories: {
            campaignRepository: CampaignRepository;
        }
    ) {}

    execute(campaignId: string) {
        return this.repositories.campaignRepository.get(campaignId);
    }
}
