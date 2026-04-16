import { TargetPopulation } from "../../models/TargetPopulation";
import { TargetPopulationRepository } from "../repositories/TargetPopulationRepository";

export class SaveTargetPopulationUseCase {
    constructor(
        private repositories: {
            targetPopulationRepository: TargetPopulationRepository;
        }
    ) {}

    async execute(targetPopulation: TargetPopulation): Promise<void> {
        return this.repositories.targetPopulationRepository.save(targetPopulation);
    }
}
