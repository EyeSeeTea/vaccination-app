import Campaign from "../../models/campaign";
import { TargetPopulation } from "../../models/TargetPopulation";
import { TargetPopulationRepository } from "../repositories/TargetPopulationRepository";

export class SaveTargetPopulationUseCase {
    constructor(
        private repositories: {
            targetPopulationRepository: TargetPopulationRepository;
        }
    ) {}

    async execute(targetPopulation: TargetPopulation, campaign: Campaign): Promise<void> {
        return this.repositories.targetPopulationRepository.save(targetPopulation, campaign);
    }
}
