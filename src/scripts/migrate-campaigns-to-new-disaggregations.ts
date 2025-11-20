import _ from "lodash";
import { command, run } from "cmd-ts";
import { getD2LegacyApi, getDefaultD2Args } from "./utils";
import Campaign from "../models/campaign";
import { CampaignD2Repository } from "../data/CampaignD2Repository";

const program = command({
    name: "create-disaggregated-metadata",
    args: {
        ...getDefaultD2Args(),
    },
    handler: async args => {
        const { config, db } = await getD2LegacyApi(args);
        const campaign = await Campaign.get(config, db, "VAAOr0LHMjd");
        const saveResult = await new CampaignD2Repository(config, db).save(campaign);
        console.debug("Save result:", saveResult);
    },
});

run(program, process.argv.slice(2));
