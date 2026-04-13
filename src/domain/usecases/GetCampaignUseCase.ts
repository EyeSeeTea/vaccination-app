import { CampaignRepository } from "../repositories/CampaignRepository";

export class GetCampaignUseCase {
    constructor(
        private repositories: {
            campaignRepository: CampaignRepository;
        }
    ) {}

    execute(dataSetId: string) {
        return this.repositories.campaignRepository.get(dataSetId);
    }
}
