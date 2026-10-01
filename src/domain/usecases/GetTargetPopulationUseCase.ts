import Campaign from "../../models/campaign";
import { TargetPopulation } from "../../models/TargetPopulation";
import { TargetPopulationRepository } from "../repositories/TargetPopulationRepository";

export class GetTargetPopulationUseCase {
    constructor(private repositories: { targetPopulationRepository: TargetPopulationRepository }) {}

    async execute(campaign: Campaign): Promise<TargetPopulation> {
        return this.repositories.targetPopulationRepository.getForCampaign(campaign);
    }
}
