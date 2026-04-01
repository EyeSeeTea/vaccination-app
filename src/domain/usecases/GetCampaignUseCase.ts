import { D2LegacyGetCampaign } from "../../models/D2LegacyGetCampaign";
import { CampaignRepository } from "../repositories/CampaignRepository";

export class GetCampaignUseCase {
    constructor(
        private repositories: {
            campaignRepositoryOld: D2LegacyGetCampaign;
            campaignRepository: CampaignRepository;
        }
    ) {}

    execute(dataSetId: string, options?: { legacy?: boolean }) {
        if (options?.legacy) {
            return this.repositories.campaignRepositoryOld.get(dataSetId);
        } else {
            return this.repositories.campaignRepository.get(dataSetId);
        }
    }
}
