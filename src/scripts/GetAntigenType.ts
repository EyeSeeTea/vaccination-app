import { assert, assertValue } from "../utils/assert";
import { D2Api } from "../types/d2-api";
import { AntigenDisaggregationEnabled, CampaignType } from "../models/AntigensDisaggregation";
import Campaign from "../models/campaign";

/**
 * Determine campaign type (reactive/preventive) for antigens in a campaign.
 *
 * Logic:
 *
 *   - If antigen is not in categoryOptionGroup "RVC_ANTIGEN_TYPE_SELECTABLE", then "preventive".
 *  - If antigen is selectable, then:
 *    - If campaign is provided, determine type from campaign name (looking for "REAC" or "PRE").
 *    - If no campaign, and a fallback type provided, use that.
 *  - If no campaign and no fallback, throw error.
 */

export class GetAntigenType {
    constructor(private data: { selectableAntigenCodes: string[] }) {}

    static async init(options: { api: D2Api }): Promise<GetAntigenType> {
        const metadata = await options.api.metadata
            .get({
                categoryOptionGroups: {
                    fields: { code: true, categoryOptions: { code: true } },
                    filter: { code: { eq: "RVC_ANTIGEN_TYPE_SELECTABLE" } },
                },
            })
            .getData();

        const categoryOptionGroup = assert(
            metadata.categoryOptionGroups[0],
            `No categoryOptionGroup "RVC_ANTIGEN_TYPE_SELECTABLE" in ${options.api.baseUrl}`
        );

        return new GetAntigenType({
            selectableAntigenCodes: categoryOptionGroup.categoryOptions.map(co => co.code),
        });
    }

    execute(options: { campaign: Campaign; antigenCode: string }): CampaignType {
        const { campaign, antigenCode } = options;

        const antigen = this.getAntigen(campaign, antigenCode);
        const typeFromCampaignName = this.getTypeFromCampaignName(campaign);

        if (antigen.type) {
            return antigen.type;
        } else if (!antigen.antigen.isTypeSelectable) {
            return "preventive";
        } else if (typeFromCampaignName) {
            return typeFromCampaignName;
        } else {
            throw new Error(`Cannot determine campaign type for antigen "${antigenCode}"`);
        }
    }

    private getAntigen(
        campaign: Campaign,
        antigenCode: string
    ): AntigenDisaggregationEnabled[number] {
        const antigens = campaign.antigensDisaggregation.getEnabled();
        const antigen = antigens.find(a => a.antigen.code === antigenCode);
        assertValue(antigen, `Antigen "${antigenCode}" not found in campaign ${campaign.id}`);
        return antigen;
    }

    private getTypeFromCampaignName(campaign: Campaign): CampaignType | undefined {
        if (campaign.name.includes("REAC")) {
            return "reactive";
        } else if (campaign.name.includes("PRE")) {
            return "preventive";
        } else {
            return undefined;
        }
    }
}
