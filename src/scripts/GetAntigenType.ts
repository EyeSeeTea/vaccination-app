import { assert } from "../utils/assert";
import { D2Api } from "../types/d2-api";
import { CampaignRef } from "./migrate-campaigns-to-new-disaggregations";
import { CampaignType } from "../models/AntigensDisaggregation";

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

    execute(options: {
        campaign: CampaignRef | undefined;
        antigenCode: string;
        fallback?: CampaignType;
    }): CampaignType {
        const { campaign, antigenCode } = options;
        const antigenIsSelectable = this.data.selectableAntigenCodes.includes(antigenCode);

        // Info from categoryOptionGroup RVC_ANTIGEN_TYPE_SELECTABLE:
        // "Antigens that can be selected also as campaign type Reactive (default: Preventive)"
        if (!antigenIsSelectable) {
            return "preventive";
        } else if (campaign) {
            return this.getTypeFromCampaignName(campaign);
        } else if (options.fallback) {
            return options.fallback;
        } else {
            const msg = `Cannot determine campaign type for antigen "${antigenCode}" with no campaign`;
            throw new Error(msg);
        }
    }

    private getTypeFromCampaignName(campaign: CampaignRef): "preventive" | "reactive" {
        if (campaign.name.includes("REAC")) {
            return "reactive";
        } else if (campaign.name.includes("PRE")) {
            return "preventive";
        } else {
            const msg = `[${campaign.id}] Could not determine type based on name "${campaign.name}"`;
            throw new Error(msg);
        }
    }
}
