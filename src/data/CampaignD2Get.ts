import _ from "lodash";
import {
    AntigensDisaggregation,
    CategoryCombosMapping,
    SectionForDisaggregation,
} from "../models/AntigensDisaggregation";
import Campaign, {
    Data,
    getExtraDataSetsIntersectingWithCampaignOrgUnits,
} from "../models/campaign";
import { getCampaignPeriods } from "../models/CampaignDb";
import { getAntigenCode } from "../models/D2CampaignMetadata";
import { AntigenConfig, getDashboardCode, MetadataConfig } from "../models/config";
import DbD2 from "../models/db-d2";
import { Maybe, OrganisationUnitPathOnly, Ref } from "../models/db.types";
import { PairOf } from "../utils/typescript";

export class CampaignD2Get {
    constructor(private config: MetadataConfig, private db: DbD2) {}

    async execute(dataSetId: string): Promise<Campaign> {
        const { config, db } = this;

        const antigensByCode = _.keyBy(config.antigens, antigen => getAntigenCode(antigen.code));
        const { dataSet, extraDataSets, dashboard } = await this.getMetadata(dataSetId);
        const antigens = this.getAntigens(dataSet, antigensByCode);
        const periods = getCampaignPeriods(dataSet);
        const categoryCombosMapping = await this.getCategoryCombosMapping(dataSet);

        const antigensDisaggregation = AntigensDisaggregation.build(
            config,
            antigens,
            categoryCombosMapping,
            dataSet.sections
        );

        const teamsMetadata = await Campaign.teamsMetadata({
            config: config,
            db: db,
            name: dataSet.name,
            organisationUnits: dataSet.organisationUnits,
        });

        const initialData: Data = {
            id: dataSet.id,
            name: dataSet.name,
            description: dataSet.description,
            organisationUnits: dataSet.organisationUnits,
            startDate: periods ? periods.startDate : null,
            endDate: periods ? periods.endDate : null,
            antigens: antigens,
            antigensDisaggregation: antigensDisaggregation,
            targetPopulation: undefined,
            teams: teamsMetadata.elements.length,
            dashboardId: dashboard ? dashboard.id : undefined,
            extraDataSets: getExtraDataSetsIntersectingWithCampaignOrgUnits(extraDataSets, dataSet),
            sections: dataSet.sections,
        };

        return new Campaign(db, config, initialData);
    }

    private async getMetadata(dataSetId: string) {
        const extraDataSetIds = this.config.dataSets.extraActivities.map(ds => ds.id);

        const {
            dataSets,
            dashboards: [dashboard],
        } = await this.db.getMetadata<MetadataQuery>({
            dataSets: {
                fields: metadataQuery.dataSets.fields,
                filters: [`id:in:[${[dataSetId, ...extraDataSetIds].join(",")}]`],
            },
            dashboards: {
                fields: metadataQuery.dashboards.fields,
                filters: [`code:eq:${getDashboardCode(this.config, dataSetId)}`],
            },
        });

        const [campaignDataSets, extraDataSets = []] = _.partition(
            dataSets,
            ds => ds.id === dataSetId
        );
        const dataSet = campaignDataSets?.[0];

        if (!dataSet) throw new Error(`Dataset id=${dataSetId} not found`);

        return { dataSet, extraDataSets, dashboard };
    }

    private async getCategoryCombosMapping(dataSet: MetadataQuery["dataSets"][0]) {
        const categoryComboIds = _(dataSet.dataSetElements)
            .map(dse => dse.categoryCombo.id)
            .uniq()
            .value();

        const { categoryCombos } = await this.db.getMetadata<{
            categoryCombos: Array<{
                id: string;
                name: string;
                categories: Ref[];
                categoryOptionCombos: { id: string; categoryOptions: Ref[] }[];
            }>;
        }>({
            categoryCombos: {
                fields: {
                    id: true,
                    name: true,
                    categories: { id: true },
                    categoryOptionCombos: { id: true, categoryOptions: { id: true } },
                },
                filters: [`id:in:[${categoryComboIds.join(",")}]`],
            },
        });

        return _(dataSet.dataSetElements)
            .map((dse): PairOf<CategoryCombosMapping> | null => {
                const categoryCombo = categoryCombos.find(cc => cc.id === dse.categoryCombo.id);
                return categoryCombo ? [dse.dataElement.id, categoryCombo] : null;
            })
            .compact()
            .fromPairs()
            .value();
    }

    private getAntigens(
        dataSet: MetadataQuery["dataSets"][0],
        antigensByCode: Record<string, AntigenConfig>
    ) {
        return _(dataSet.sections)
            .map(section => {
                const antigenCode = getAntigenCodeFromSection(section);
                return antigenCode ? antigensByCode[antigenCode] : undefined;
            })
            .compact()
            .value();
    }
}

export function getAntigenCodeFromSection(section: { code: Maybe<string> }): string {
    // section.code: "RVC_${dataSetId}-MALARIA"
    return section.code?.split("-")[1] || "";
}
type MetadataQuery = {
    dataSets: Array<{
        id: string;
        name: string;
        code: string;
        description: string;
        organisationUnits: Array<OrganisationUnitPathOnly>;
        dataInputPeriods: Array<{ period: { id: string } }>;
        dataSetElements: Array<{
            dataElement: { id: string };
            categoryCombo: { id: string };
        }>;
        sections: Array<Omit<SectionForDisaggregation, "categoryCombo">>;
        attributeValues: Array<{ attribute: { code: string }; value: string }>;
    }>;
    dashboards: Array<{
        id: string;
    }>;
};
const metadataQuery = {
    dataSets: {
        fields: {
            id: true,
            name: true,
            code: true,
            description: true,
            organisationUnits: { id: true, path: true },
            dataInputPeriods: { period: { id: true } },
            dataSetElements: { dataElement: { id: true }, categoryCombo: { id: true } },
            attributeValues: { attribute: { code: true }, value: true },
            sections: {
                id: true,
                name: true,
                code: true,
                dataSet: { id: true },
                dataElements: { id: true, code: true },
                sortOrder: true,
                greyedFields: {
                    categoryOptionCombo: {
                        id: true,
                        categoryOptions: {
                            id: true,
                            name: true,
                            displayName: true,
                            categories: { id: true },
                        },
                    },
                    dataElement: { id: true },
                },
            },
        },
    },
    dashboards: {
        fields: { id: true },
    },
};
