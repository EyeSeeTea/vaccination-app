import _ from "lodash";
import { command, run, option, string } from "cmd-ts";
import { getAppApi } from "./utils";
import { MetadataConfig } from "../models/config";
// @ts-ignore
import DbD2 from "../models/db-d2";
import { CampaignD2Repository } from "../data/CampaignD2Repository";
import { getCampaign } from "../data/__tests/getCampaign";
import { assert } from "../utils/assert";

const program = command({
    name: "create-disaggregated-metadata",
    args: {
        url: option({
            type: string,
            long: "url",
            description: "Target DHIS2 URL",
        }),
        auth: option({
            type: string,
            long: "auth",
            description: "Authentication credentials (USER:PASSWORD)",
        }),
    },
    handler: async args => {
        const appApi = await getAppApi(args);
        await new SaveCampaign(appApi.legacy).execute();
    },
});

// load (old, new) + save (new)

class SaveCampaign {
    constructor(private options: { db: DbD2; config: MetadataConfig }) {}

    async execute() {
        const { db, config } = this.options;

        const campaign = getCampaign(config, db);
        const saveResult = await new CampaignD2Repository(config, db).save(campaign);
        console.debug("Campaign save:", saveResult);

        const campaignWithPopulation = await campaign.withTargetPopulation();
        const targetPopulation = assert(campaignWithPopulation.targetPopulation);

        const targetPopulationUpdated = targetPopulation
            // MSF -> OCBA -> DRC_SK -> ZZZ_RUSK_211201_Bikenge, Rougeole_CLOSED -> CDS MBUTU
            .setTotalPopulation("lrjmTKZJUEx", 1000) //
            // Malaria
            .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "5 - 11 m" }, 1)
            .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "12 - 23 m" }, 2)
            .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "24 - 35 m" }, 3)
            // Japanese Encephalitis
            .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "8 - 11 m" }, 4)
            .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "15 - 29 m" }, 5);

        const dataValues = await targetPopulationUpdated.getDataValues();
        console.debug(`Population: ${dataValues.length} data values to save.`);
        const populationResult = await campaign.db.postDataValues(dataValues);
        console.debug("Population saved:", populationResult);
    }
}

run(program, process.argv.slice(2));
