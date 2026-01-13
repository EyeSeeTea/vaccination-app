import _ from "lodash";
import { CampaignRepository } from "../domain/repositories/CampaignRepository";
import {
    AntigensDisaggregation,
    CategoryCombosMapping,
    SectionForDisaggregation,
} from "../models/AntigensDisaggregation";
import Campaign, {
    Data,
    getExtraDataSetsIntersectingWithCampaignOrgUnits,
} from "../models/campaign";
import CampaignDb, { getCampaignPeriods } from "../models/CampaignDb";
import { getAntigenCode } from "../models/D2CampaignMetadata";
import { getDashboardCode, MetadataConfig } from "../models/config";
import DbD2 from "../models/db-d2";
import { Maybe, OrganisationUnitPathOnly, Ref, Response } from "../models/db.types";

export class CampaignD2Repository implements CampaignRepository {
    constructor(private config: MetadataConfig, private db: DbD2) {}

    async get(id: string): Promise<Campaign> {
        return new CampaignD2Get(this.config, this.db).execute(id);
    }

    async save(campaign: Campaign): Promise<Response<string>> {
        return new CampaignDb(campaign).save();
    }
}

class CampaignD2Get {
    constructor(private config: MetadataConfig, private db: DbD2) {}

    async execute(id: string): Promise<Campaign> {
        const { config, db } = this;
        const extraDataSetIds = config.dataSets.extraActivities.map(ds => ds.id);
        const dataSetId = id;

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
        }>({
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

        const antigensByCode = _.keyBy(config.antigens, antigen => getAntigenCode(antigen.code));

        const antigens = _(dataSet.sections)
            .map(section => {
                const antigenCode = getAntigenCodeFromSection(section);
                return antigenCode ? antigensByCode[antigenCode] : undefined;
            })
            .compact()
            .value();

        const periods = getCampaignPeriods(dataSet);
        const { sections } = dataSet;

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

        const categoryCombosMapping = _(dataSet.dataSetElements)
            .map(
                (
                    dse
                ):
                    | [
                          keyof CategoryCombosMapping,
                          CategoryCombosMapping[keyof CategoryCombosMapping]
                      ]
                    | null => {
                    const categoryCombo = categoryCombos.find(cc => cc.id === dse.categoryCombo.id);
                    return categoryCombo ? [dse.dataElement.id, categoryCombo] : null;
                }
            )
            .compact()
            .fromPairs()
            .value();

        const antigensDisaggregation = AntigensDisaggregation.build(
            config,
            antigens,
            categoryCombosMapping,
            sections
        );

        const teamsMetadata = await Campaign.teamsMetadata({
            config: config,
            db: db,
            organisationUnits: dataSet.organisationUnits,
            name: dataSet.name,
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
            sections: sections,
        };

        return new Campaign(db, config, initialData);
    }
}

//   code="RVC_[dataSetId]-MALARIA"
export function getAntigenCodeFromSection(section: { code: Maybe<string> }): string {
    return section.code?.split("-")[1] || "";
}
