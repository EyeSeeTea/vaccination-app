import _ from "lodash";
import { array, command, flag, multioption, run, string } from "cmd-ts";
import {
    getAppApi,
    AppApi,
    getCampaignDataSets,
    getLogsArguments,
    setupLogsFromArgs,
    getDefaultD2Args,
} from "./utils";
import { CampaignD2Repository } from "../data/CampaignD2Repository";
import DbD2 from "../models/db-d2";
import { MetadataConfig } from "../models/config";

const program = command({
    name: "create-disaggregated-metadata",
    args: {
        ...getDefaultD2Args(),
        campaignIds: multioption({
            type: array(string),
            long: "campaign-id",
            description: "Campaign (data set) ID of the campaign to migrate",
        }),
        allCampaigns: flag({
            long: "all-campaigns",
            description: "Migrate all campaigns from source to target",
        }),
        ...getLogsArguments(),
    },
    handler: async args => {
        setupLogsFromArgs(args);

        const target = await getAppApi({ url: args.url, auth: args.auth });

        if (args.campaignIds.length === 0 && !args.allCampaigns) {
            throw new Error("At least one --campaign-id or --all-campaigns must be provided");
        }

        const campaignIds = args.allCampaigns
            ? await MigrateCampaignToNewDisaggregations.getCampaignIds(target.legacy)
            : args.campaignIds;

        const migrateCampaign = await MigrateCampaignToNewDisaggregations.init({ target });

        for (const id of campaignIds) {
            try {
                await migrateCampaign.execute(id);
            } catch (error) {
                console.error(`Error migrating campaign ${id}`, error);
            }
        }
    },
});

class MigrateCampaignToNewDisaggregations {
    constructor(private instances: { target: AppApi }) {}

    static async init(instances: { target: AppApi }) {
        return new MigrateCampaignToNewDisaggregations(instances);
    }

    async execute(id: string): Promise<void> {
        const target = this.instances.target.legacy;

        const log = (msg: string) => console.debug(`[${id}] ${msg}`);

        const campaignRepository = new CampaignD2Repository(target.config, target.db);
        const campaign = await campaignRepository.get(id);
        log(`Resaving campaign ${target.db.api.baseUrl}: ${campaign.name} [${campaign.id}]`);

        const saveResult = await campaignRepository.saveDisaggregations(campaign);
        log(`Result: ${JSON.stringify(saveResult)}`);
    }

    static async getCampaignIds(options: { config: MetadataConfig; db: DbD2 }): Promise<string[]> {
        console.debug(`Fetching all campaigns from source`);
        const campaigns = await getCampaignDataSets(options);
        console.debug(`Found ${campaigns.length} campaigns`);
        return campaigns.map(campaign => campaign.id);
    }
}

run(program, process.argv.slice(2));
