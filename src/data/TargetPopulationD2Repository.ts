import { TargetPopulationRepository } from "../domain/repositories/TargetPopulationRepository";
import Campaign from "../models/campaign";
import DbD2 from "../models/db-d2";
import { TargetPopulation } from "../models/TargetPopulation";

export class TargetPopulationD2Repository implements TargetPopulationRepository {
    constructor(private db: DbD2) {}

    async getForCampaign(campaign: Campaign): Promise<TargetPopulation> {
        return TargetPopulation.build(campaign);
    }

    async save(targetPopulation: TargetPopulation): Promise<void> {
        const dataValues = await targetPopulation.getDataValues();
        const populationResult = await this.db.postDataValues(dataValues);

        if (!populationResult.status) {
            const msg = populationResult.error || "Unknown error";
            throw new Error("Error saving target population: " + msg);
        }
    }
}
