import _ from "lodash";
import { command, option, run, string } from "cmd-ts";
import { getD2LegacyApi, getSourceTargetD2Args } from "./utils";
import Campaign from "../models/campaign";
import { CampaignD2Repository } from "../data/CampaignD2Repository";

const program = command({
    name: "create-disaggregated-metadata",
    args: {
        ...getSourceTargetD2Args(),
        dataSetId: option({
            type: string,
            long: "dataset-id",
            description: "Data set ID of the campaign to migrate",
        }),
    },
    handler: async args => {
        const source = await getD2LegacyApi({ url: args.sourceUrl, auth: args.sourceAuth });
        const target = await getD2LegacyApi({ url: args.targetUrl, auth: args.targetAuth });

        const campaign = await Campaign.get(source.config, source.db, args.dataSetId, {
            legacy: true,
        });
        console.debug(`Loaded campaign from ${args.sourceUrl}: ${campaign.name}`);

        campaign.config = target.config;
        campaign.db = target.db;

        console.debug(`Migrating campaign to ${args.targetAuth}`);
        const campaignRepository = new CampaignD2Repository(target.config, target.db);
        const saveResult = await campaignRepository.save(campaign);
        console.debug("Save result:", saveResult);
    },
});

run(program, process.argv.slice(2));
