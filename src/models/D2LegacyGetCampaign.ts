import _ from "lodash";
import {
    SectionForDisaggregation,
    AntigensDisaggregationLegacy,
} from "./AntigensDisaggregationLegacy";
import Campaign, { Data, getExtraDataSetsIntersectingWithCampaignOrgUnits } from "./campaign";
import { getCampaignPeriods } from "./CampaignDb";
import { MetadataConfig, getDashboardCode, getByIndex } from "./config";
import DbD2 from "./db-d2";
import { OrganisationUnitPathOnly } from "./db.types";
import { getTeamsForCampaign } from "./Teams";

export class D2LegacyGetCampaign {
    constructor(private config: MetadataConfig, private db: DbD2) {}

    public async get(dataSetId: string): Promise<Campaign> {
        const { config, db } = this;

        const extraDataSetIds = config.dataSets.extraActivities.map(ds => ds.id);

        const {
            dataSets,
            dashboards: [dashboard],
        } = await db.getMetadata<{
            dataSets: Array<{
                id: string;
                name: string;
                code: string;
                description: string;
                organisationUnits: Array<OrganisationUnitPathOnly>;
                dataInputPeriods: Array<{ period: { id: string } }>;
                sections: Array<SectionForDisaggregation>;
                attributeValues: Array<{ attribute: { code: string }; value: string }>;
            }>;
            dashboards: Array<{
                id: string;
            }>;
        }>({
            dataSets: {
                fields: {
                    id: true,
                    name: true,
                    code: true,
                    description: true,
                    organisationUnits: { id: true, path: true },
                    dataInputPeriods: { period: { id: true } },
                    attributeValues: { attribute: { code: true }, value: true },
                    sections: {
                        id: true,
                        name: true,
                        dataSet: { id: true },
                        dataElements: { id: true },
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
                filters: [`id:in:[${[dataSetId, ...extraDataSetIds].join(",")}]`],
            },
            dashboards: {
                fields: { id: true },
                filters: [`code:eq:${getDashboardCode(config, dataSetId)}`],
            },
        });

        const [campaignDataSets, extraDataSets = []] = _.partition(
            dataSets,
            ds => ds.id === dataSetId
        );
        const dataSet = campaignDataSets?.[0];

        if (!dataSet) throw new Error(`Dataset id=${dataSetId} not found`);

        const antigensByCode = _.keyBy(config.antigens, "code");
        const antigens = _(dataSet.sections)
            .map(section => antigensByCode[section.name])
            .compact()
            .value();

        const periods = getCampaignPeriods(dataSet);

        const { categoryComboCodeForTeams } = config;
        const { name, sections } = dataSet;
        const ouIds = dataSet.organisationUnits.map(ou => ou.id);
        const teamsCategoyId = getByIndex(config.categories, "code", categoryComboCodeForTeams).id;
        const teamsMetadata = await getTeamsForCampaign(db, ouIds, teamsCategoyId, name);
        const antigensDisaggregation = AntigensDisaggregationLegacy.build(
            config,
            antigens,
            sections
        );

        const initialData: Data = {
            id: dataSet.id,
            name: dataSet.name,
            description: dataSet.description,
            organisationUnits: dataSet.organisationUnits,
            startDate: periods ? periods.startDate : null,
            endDate: periods ? periods.endDate : null,
            antigens: antigens,
            antigensDisaggregation,
            targetPopulation: undefined,
            teams: _.size(teamsMetadata),
            dashboardId: dashboard ? dashboard.id : undefined,
            extraDataSets: getExtraDataSetsIntersectingWithCampaignOrgUnits(extraDataSets, dataSet),
            sections: sections,
        };

        return new Campaign(db, config, initialData);
    }
}
