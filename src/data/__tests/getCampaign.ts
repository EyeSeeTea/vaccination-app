import _ from "lodash";
import Campaign from "../../models/campaign";
import { AntigenConfig, MetadataConfig } from "../../models/config";
import DbD2 from "../../models/db-d2";
import { assert } from "../../utils/assert";

export function getCampaign(config: MetadataConfig, db: DbD2): Campaign {
    return new TeamCampaignBuilder(config, db).get();
}

class TeamCampaignBuilder {
    disaggregationActions = [
        // Vaccine Doses Administered -> Age Groups (Dose 4)
        select__("MALARIA.dataElements.0.categories.4.selected"),
        // AEFI -> Severity -> Minor
        unselect("MALARIA.dataElements.5.categories.2.options.0.values.0.0.selected"),

        // Vaccine Doses Administered -> 12-59m and 5-14y
        unselect("JPENC.dataElements.0.categories.3.options.1.values.0.0.selected"),
        unselect("JPENC.dataElements.0.categories.3.options.2.values.0.0.selected"),
        // Select Vaccine Doses Administered -> Gender
        select__("JPENC.dataElements.0.categories.4.selected"),
        // Unselect Syringes for Dillution
        unselect("JPENC.dataElements.4.selected"),
    ];

    constructor(private config: MetadataConfig, private db: DbD2) {}

    get(): Campaign {
        const [malaria, japaneseEnc] = this.getAntigens();

        const campaign = Campaign.create(this.config, this.db)
            .update({
                name: "ZCampaignD2Repository Test",
                description: "Test Campaign",
                startDate: new Date("2025-11-19"),
                endDate: new Date("2025-11-20"),
                organisationUnits: [
                    // CDS Mbutu -> External Consultations
                    {
                        id: "lrjmTKZJUEx",
                        path: "/zOyMxdCLXBM/G7g4TvbjFlX/o9PqPy9YOvf/wY8HiLmETeU/BaEwEdzSA6G/lrjmTKZJUEx",
                    },
                ],
                teams: 1,
            })
            .setAntigens([malaria, japaneseEnc])
            .setCampaignTypeForAntigen(malaria, "preventive")
            .setCampaignTypeForAntigen(japaneseEnc, "reactive");

        return this.applyDisaggregationActions(campaign, this.disaggregationActions) //
            .setExtraDataSet(this.getNutritionDataSet(), { isEnabled: true });
    }

    private getAntigens(): [AntigenConfig, AntigenConfig] {
        const [malaria, japaneseEnc] = _(this.config.antigens)
            .keyBy(antigen => antigen.code)
            .at(["RVC_ANTIGEN_MALARIA", "RVC_ANTIGEN_JPENC"])
            .compact()
            .value();

        if (!malaria || !japaneseEnc) throw new Error("Antigens not found in config");

        return [malaria, japaneseEnc];
    }

    private getNutritionDataSet() {
        return assert(
            _(this.config.dataSets.extraActivities)
                .filter(ds => ds.code === "DS_NSd_3")
                .first()
        );
    }

    private applyDisaggregationActions(
        campaign: Campaign,
        actions: DisaggregationAction[]
    ): Campaign {
        const disaggregationUpdated = actions.reduce(
            (dis, action) => dis.set(action.path, action.value),
            campaign.antigensDisaggregation
        );
        return campaign.setAntigensDisaggregation(disaggregationUpdated);
    }
}

type DisaggregationAction = {
    path: Array<string | number>;
    value: boolean;
};

function setValue(path: string, value: boolean): DisaggregationAction {
    return { path: ("RVC_ANTIGEN_" + path).split("."), value: value };
}

function select__(path: string): DisaggregationAction {
    return setValue(path, true);
}

function unselect(path: string): DisaggregationAction {
    return setValue(path, false);
}
