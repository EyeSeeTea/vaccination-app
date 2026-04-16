import Campaign from "../../models/campaign";
import { TargetPopulation } from "../../models/TargetPopulation";

export interface TargetPopulationRepository {
    getForCampaign(campaign: Campaign): Promise<TargetPopulation>;
    save(targetPopulation: TargetPopulation, campaign: Campaign): Promise<void>;
}
