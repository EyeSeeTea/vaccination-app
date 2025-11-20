import _ from "lodash";
import { D2Api } from "@eyeseetea/d2-api/2.36";
import { command, run, option, string } from "cmd-ts";
import { getD2Api } from "./utils";
import { getMetadataConfig } from "../models/config";
// @ts-ignore
import { init } from "d2";
import DbD2 from "../models/db-d2";
import { CampaignD2Repository } from "../data/CampaignD2Repository";
import { getCampaign } from "../data/__tests/getCampaign";

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
        const api = getD2Api(args.auth, args.url);
        await new SaveCampaign(api).execute();
    },
});

// load (old, new) + save (new)

class SaveCampaign {
    constructor(private api: D2Api) {}

    async execute() {
        const d2 = await init({ baseUrl: this.api.baseUrl + "/api" });
        const db = new DbD2(d2);
        const config = await getMetadataConfig(db);

        //const campaign0 = await Campaign.get(config, db, "GEiIBCM2cMI");
        //return;

        const campaign = getCampaign(config, db);
        const saveResult = await new CampaignD2Repository(config, db).save(campaign);
        console.debug("Campaign save:", saveResult);

        /*
        const campaignWithPopulation = await campaign.withTargetPopulation();
        const targetPopulation = assert(campaignWithPopulation.targetPopulation);

        const targetPopulationUpdated = targetPopulation
            // MSF -> OCBA -> DRC_SK -> ZZZ_RUSK_211201_Bikenge, Rougeole_CLOSED -> CDS MBUTU
            .setTotalPopulation("lrjmTKZJUEx", 1000) //
            .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "8 - 14 y" }, 5)
            .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "12 - 59 m" }, 3);

        const dataValues = await targetPopulationUpdated.getDataValues();
        console.debug(`Population: ${dataValues.length} data values to save.`);
        const populationResult = await campaign.db.postDataValues(dataValues);
        console.debug("Population saved:", populationResult);
        */
    }
}

run(program, process.argv.slice(2));
