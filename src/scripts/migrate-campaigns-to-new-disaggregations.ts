import _ from "lodash";
import { command, flag, option, optional, run, string } from "cmd-ts";
import { getAppApi, getSourceTargetD2Args, AppApi, getCampaignDataSets } from "./utils";
import Campaign from "../models/campaign";
import { CampaignD2Repository } from "../data/CampaignD2Repository";
import DbD2 from "../models/db-d2";
import { MetadataConfig } from "../models/config";
import { assert } from "../utils/assert";
import { GetAntigenType } from "./GetAntigenType";

const program = command({
    name: "create-disaggregated-metadata",
    args: {
        ...getSourceTargetD2Args(),
        campaignId: option({
            type: optional(string),
            long: "campaign-id",
            description: "Campaign (data set) ID of the campaign to migrate",
        }),
        allCampaigns: flag({
            long: "all-campaigns",
            description: "Migrate all campaigns from source to target",
        }),
    },
    handler: async args => {
        const source = await getAppApi({ url: args.sourceUrl, auth: args.sourceAuth });
        const target = await getAppApi({ url: args.targetUrl, auth: args.targetAuth });

        if (!args.campaignId && !args.allCampaigns) {
            throw new Error("Either --campaign-id or --all-campaigns must be provided");
        }

        const campaignIds = args.allCampaigns
            ? await MigrateCampaignToNewDisaggregations.getCampaignIds(source.legacy)
            : _.compact([args.campaignId]);

        const migrateCampaign = await MigrateCampaignToNewDisaggregations.init({ source, target });

        for (const id of campaignIds) {
            await migrateCampaign.execute(id);
        }
    },
});

class MigrateCampaignToNewDisaggregations {
    constructor(private instances: { source: AppApi; target: AppApi }) {}

    static async init(instances: { source: AppApi; target: AppApi }) {
        return new MigrateCampaignToNewDisaggregations(instances);
    }

    async execute(id: string): Promise<void> {
        const source = this.instances.source.legacy;
        const target = this.instances.target.legacy;

        const log = (msg: string) => console.debug(`[${id}] ${msg}`);
        const campaign = await Campaign.get(source.config, source.db, id, { legacy: true });
        log(`Loaded campaign from ${source.db.api.baseUrl}: ${campaign.name} [${campaign.id}]`);

        log(`Migrating campaign to ${target.db.api.baseUrl}`);
        // Object campaign references source config and db, override with target
        Object.assign(campaign, target);
        const campaign2 = await this.updateCampaignTypeForAntigens(campaign);
        const campaignRepository = new CampaignD2Repository(target.config, target.db);
        const saveResult = await campaignRepository.save(campaign2);
        log(`Result: ${JSON.stringify(saveResult)}`);
    }

    static async getCampaignIds(options: { config: MetadataConfig; db: DbD2 }): Promise<string[]> {
        console.debug(`Fetching all campaigns from source`);
        const campaigns = await getCampaignDataSets(options);
        console.debug(`Found ${campaigns.length} campaigns`);
        return campaigns.map(campaign => campaign.id);
    }

    // Old campaigns won't have preventive/reactive tags for antigens set, so let's set them here
    // based on the logic in GetAntigenType
    private async updateCampaignTypeForAntigens(campaign: Campaign): Promise<Campaign> {
        const getAntigenType = await GetAntigenType.init({ api: this.instances.target.d2Api });
        const campaignRef = { id: assert(campaign.id), name: campaign.name };

        return campaign.antigens.reduce((accCampaign, antigen) => {
            const campaignType = getAntigenType.execute({
                campaign: campaignRef,
                antigenCode: antigen.code,
            });
            console.debug(`  - Setting antigen ${antigen.code} to ${campaignType.toUpperCase()}`);
            return accCampaign.setCampaignTypeForAntigen(antigen, campaignType);
        }, campaign);
    }
}

export type CampaignRef = { id: string; name: string };

run(program, process.argv.slice(2));
