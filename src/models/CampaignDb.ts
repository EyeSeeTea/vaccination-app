import DbD2, { ApiResponse, ModelReference } from "./db-d2";
import moment from "moment";
import _ from "lodash";
import "../utils/lodash-mixins";

import Campaign from "./campaign";
import { Maybe, MetadataResponse, Section, CategoryOption, NamedRef, Ref } from "./db.types";
import { Metadata, DataSet, Response } from "./db.types";
import { formatDay } from "../utils/date";
import {
    CocMetadata,
    AntigenDisaggregationEnabledDataElement,
    AntigenDisaggregationEnabledDataElementCategory,
} from "./AntigensDisaggregationLegacy";
import { Dashboard, DashboardMetadata } from "./Dashboard";
import { Teams, CategoryOptionTeam } from "./Teams";
import { getDashboardCode, getByIndex, baseConfig, MetadataConfig } from "./config";
import { assert } from "../utils/assert";
import { getUid } from "../utils/dhis2";
import {
    getDisaggregatedDataElements,
    campaignTypes,
    categoriesInDataElement,
    dataElementsInfo,
    getAntigenCode,
    getDataElementDisaggregations,
} from "./D2CampaignMetadata";

interface DataSetWithSections {
    sections: Array<{ id: string; name: string; dataSet: { id: string } }>;
    dataEntryForm: { id: string };
}

/*
Problem: When syncing data from field servers to HQ, data cannot usually be imported
because the current time is after the closing date of the data input periods.

Solution: Use a custom attribute to store the data input periods
*/

export type DataInput = {
    periodStart: string;
    periodEnd: string;
    openingDate: string;
    closingDate: string;
};

interface PostSaveMetadata {
    visualizations: object[];
    dashboards: object[];
    dataSets: DataSet[];
    sections: Section[];
    categoryOptions: NamedRef[];
}

export default class CampaignDb {
    antigenCategoryId: string;
    ageGroupCategoryId: string;
    teamsCategoryId: string;
    dosesCategoryId: string;
    catComboIdForTeams: string;

    constructor(public campaign: Campaign) {
        const { categories, categoryCombos, categoryCodeForAgeGroup } = campaign.config;
        const { categoryCodeForTeams, categoryCodeForDoses, categoryCodeForAntigens } =
            campaign.config;
        const { categoryComboCodeForTeams } = campaign.config;
        const categoriesByCode = _(categories).keyBy(category => category.code);

        this.ageGroupCategoryId = categoriesByCode.getOrFail(categoryCodeForAgeGroup).id;
        this.teamsCategoryId = categoriesByCode.getOrFail(categoryCodeForTeams).id;
        this.dosesCategoryId = categoriesByCode.getOrFail(categoryCodeForDoses).id;
        this.antigenCategoryId = categoriesByCode.getOrFail(categoryCodeForAntigens).id;
        this.catComboIdForTeams = getByIndex(categoryCombos, "code", categoryComboCodeForTeams).id;
    }

    public async createDashboard(): Promise<string> {
        if (!this.campaign.id) throw new Error("Cannot create dashboard for unpersisted campaign");
        const teamsMetadata = await this.campaign.teamsMetadata();
        const teamIds = teamsMetadata.elements.map(t => t.id);
        const dashboardMetadata = await this.getDashboardMetadata(this.campaign.id, teamIds);
        const metadata: PostSaveMetadata = {
            ...dashboardMetadata,
            dataSets: [],
            sections: [],
            categoryOptions: [],
        };
        const response = await this.postSave(metadata, {});
        const dashboard = dashboardMetadata.dashboards[0];

        if (!response.status || !dashboard || !dashboard.id) {
            throw new Error("Error creating dashboard");
        } else {
            return dashboard.id;
        }
    }

    public async save(): Promise<Response<string>> {
        const { campaign } = this;
        const { db, config: metadataConfig } = campaign;
        const dataSetId = campaign.id || getUid("dataSet", campaign.name);
        console.debug(`Saving campaign with dataSetId=${dataSetId}`);

        if (!campaign.startDate || !campaign.endDate) {
            return { status: false, error: "Campaign Dates not set" };
        }
        const startDate = moment(campaign.startDate).startOf("day");
        const endDate = moment(campaign.endDate).endOf("day");
        const teamsMetadata = await campaign.teamsMetadata();

        const teamGenerator = Teams.build(teamsMetadata);
        const newTeams = teamGenerator.getTeams({
            teams: campaign.teams || 0,
            name: campaign.name,
            organisationUnits: campaign.organisationUnits,
            teamsCategoyId: this.teamsCategoryId,
            startDate,
            endDate,
            isEdit: await campaign.isEdit(),
        });

        const teamIds = newTeams.map(team => team.id);
        const dashboardMetadata = await this.getDashboardMetadata(dataSetId, teamIds);

        const teamsToDelete = _.differenceBy(teamsMetadata.elements, newTeams, "id");
        const disaggregationData = campaign.getEnabledAntigensDisaggregation();

        type DataSetElement = {
            dataSet: { id: string };
            dataElement: { id: string };
            categoryCombo: { id: string };
        };

        const dataSetElements = _(disaggregationData)
            .flatMap((dd): DataSetElement[] => {
                return getDisaggregatedDataElements(campaign, dd).map(
                    ({ formDataElement, categoryCombo }) => {
                        return {
                            dataSet: { id: dataSetId },
                            dataElement: { id: formDataElement.id },
                            categoryCombo: { id: categoryCombo.id },
                        };
                    }
                );
            })
            .uniqBy(dse => dse.dataElement.id)
            .value();

        const dataInput = getDataInputFromCampaign(campaign);
        const existingDataSet = await this.getExistingDataSet();
        const metadataCoc = await campaign.antigensDisaggregation.getCocMetadata(db);
        const sections = await this.getSections(dataSetId, metadataCoc);
        const sharing = await campaign.getDataSetSharing();
        const campaignOrgUnitRefs = campaign.organisationUnits.map(ou => ({ id: ou.id }));

        const dataSet: DataSet = {
            id: dataSetId,
            name: campaign.name,
            shortName: campaign.name.slice(0, 50),
            description: campaign.description,
            periodType: "Daily",
            categoryCombo: { id: this.catComboIdForTeams },
            dataElementDecoration: true,
            renderAsTabs: true,
            organisationUnits: campaignOrgUnitRefs,
            dataSetElements: dataSetElements,
            openFuturePeriods: 1,
            timelyDays: 0,
            expiryDays: 0,
            formType: "CUSTOM",
            dataInputPeriods: [],
            attributeValues: [
                { value: "true", attribute: { id: metadataConfig.attributes.app.id } },
                { value: "true", attribute: { id: metadataConfig.attributes.hideInTallySheet.id } },
                {
                    value: dataInput ? JSON.stringify(dataInput) : "",
                    attribute: { id: metadataConfig.attributes.dataInputPeriods.id },
                },
            ],
            dataEntryForm: null,
            sections: sections.map(section => ({ id: section.id })),
            ...sharing,
        };

        const extraDataSets = await this.getExtraDataSets();

        return this.postSave(
            {
                ...dashboardMetadata,
                dataSets: [dataSet, ...extraDataSets],
                sections: sections,
                categoryOptions: newTeams,
            },
            { teamsToDelete, existingDataSet }
        );
    }

    private async getExtraDataSets(): Promise<DataSet[]> {
        const { campaign } = this;
        const dataSetIds = this.campaign.config.dataSets.extraActivities.map(ds => ds.id);
        const campaignOrgUnitRefs = campaign.organisationUnits.map(ou => ({ id: ou.id }));

        const res = await this.campaign.db.getMetadata<{
            dataSets: Array<DataSet>;
        }>({
            dataSets: {
                filters: [`id:in:[${dataSetIds.join(",")}]`],
                fields: { ":owner": true },
            },
        });

        const extraDataSets = res.dataSets;
        const campaignOrgUnitIds = new Set(campaignOrgUnitRefs.map(ou => ou.id));

        return extraDataSets.map(dataSet => {
            const isExtraDataSetSelected = campaign.extraDataSets.some(ds => ds.id === dataSet.id);

            return {
                ...dataSet,
                organisationUnits: _(dataSet.organisationUnits)
                    .reject(orgUnit => campaignOrgUnitIds.has(orgUnit.id))
                    .concat(isExtraDataSetSelected ? campaignOrgUnitRefs : [])
                    .value(),
            };
        });
    }

    public async saveTargetPopulation(): Promise<Response<string>> {
        const { campaign } = this;
        const { targetPopulation } = this.campaign;

        if (!targetPopulation) {
            return { status: false, error: "There is no target population in campaign" };
        } else {
            const dataValues = await targetPopulation.getDataValues();
            const populationResult = await campaign.db.postDataValues(dataValues);

            if (!populationResult.status) {
                return {
                    status: false,
                    error: JSON.stringify(populationResult.error, null, 2),
                };
            } else {
                return { status: true };
            }
        }
    }

    private async postSave(
        allMetadata: PostSaveMetadata,
        options: {
            teamsToDelete?: CategoryOptionTeam[];
            existingDataSet?: DataSetWithSections;
        }
    ): Promise<Response<string>> {
        const { campaign } = this;
        const { db, config } = campaign;
        const { teamsToDelete = [], existingDataSet } = options;
        const { sections, ...nonSectionsMetadata } = allMetadata;
        let metadata;
        let existingModels: ModelReference[];

        const isEdit = await campaign.isEdit();

        if (isEdit) {
            // The saving of existing sections on DHIS2 is buggy: /metadata
            // often responds with a 500 Server Error when a data set and their sections are
            // posted on the same request. Workaround: post the sections on a separate request.

            if (!_(sections).isEmpty()) {
                const resultSections = await db.postMetadata({ sections });

                if (!resultSections.status) {
                    return { status: false, error: "Cannot update sections" };
                }
            }
            metadata = nonSectionsMetadata;
            existingModels = await Campaign.getResources(config, db, allMetadata.dataSets);
        } else {
            metadata = allMetadata;
            existingModels = [];
        }

        if (existingDataSet) {
            await this.campaign.db.postMetadata(
                {
                    sections: _.difference(
                        existingDataSet.sections.map(section => section.id),
                        allMetadata.sections.map(section => section.id)
                    ).map(id => ({ id })),
                },
                { importStrategy: "DELETE" }
            );
        }

        const result: ApiResponse<MetadataResponse> = await db.postMetadata<Metadata>(metadata);

        if (isEdit) {
            await this.cleanUpDashboardItems(db, metadata, existingModels);

            // Teams must be deleted after all asociated dashboard and dashboard items (favorites) are deleted
            if (!_.isEmpty(teamsToDelete)) {
                await Teams.deleteTeams(db, teamsToDelete);
            }
        }
        // Update Team Category with new categoryOptions (teams)
        await Teams.updateTeamCategory(db, allMetadata.categoryOptions, teamsToDelete, config);

        if (!result.status) {
            return { status: false, error: result.error };
        } else if (result.value.status !== "OK") {
            return {
                status: false,
                error: JSON.stringify(result.value.typeReports, null, 2),
            };
        } else {
            return { status: true };
        }
    }

    private async cleanUpDashboardItems(
        db: DbD2,
        metadata: Omit<PostSaveMetadata, "sections">,
        modelReferencesToDelete: ModelReference[]
    ): Promise<Response<string>> {
        const idsInMetadata = _(metadata.visualizations)
            .map(dashboard => (dashboard as Ref).id)
            .compact()
            .value();

        const dashboardItems = _(modelReferencesToDelete)
            .filter(o => o.model === "visualizations" && !idsInMetadata.includes(o.id))
            .value();

        return await db.deleteMany(dashboardItems);
    }

    private async getSections(dataSetId: string, cocMetadata: CocMetadata): Promise<Section[]> {
        const { campaign } = this;
        const disaggregationData = campaign.getEnabledAntigensDisaggregation();

        const sectionsUsed = disaggregationData.map((disaggregationDataItem, index): Section => {
            const campaignType = assert(disaggregationDataItem.type);
            const { antigen } = disaggregationDataItem;
            const sectionName = `${antigen.name} [${campaignTypes[campaignType].name}]`;

            const greyedFields = _(getDisaggregatedDataElements(campaign, disaggregationDataItem))
                .flatMap(({ dataElement, formDataElement, categoryCombo }) => {
                    const disaggregations = getDisaggregations(
                        campaign.config,
                        dataElement,
                        formDataElement
                    );

                    const cocIdsEnabled = _(disaggregations)
                        .map(disaggregation => {
                            const categoryOptions2 = disaggregation.filter(dis => {
                                return !categoriesInDataElement.includes(dis.categoryCode);
                            });
                            return cocMetadata.getByOptions(categoryOptions2);
                        })
                        .compact()
                        .uniq()
                        .value();

                    const cocIdsAllForCategoryCombo = cocMetadata.getByCategoryCombo(categoryCombo);
                    const cocIdsToDisable = _.difference(cocIdsAllForCategoryCombo, cocIdsEnabled);

                    return cocIdsToDisable.map(cocIdToDisable => {
                        return {
                            dataElement: { id: formDataElement.id },
                            categoryOptionCombo: { id: cocIdToDisable },
                        };
                    });
                })
                .sortBy(gf => [gf.dataElement.id, gf.categoryOptionCombo.id].join("."))
                .value();

            const dataElements2 = getDisaggregatedDataElements(campaign, disaggregationDataItem)
                .map(de => de.formDataElement)
                .filter(dataElement => {
                    const isDataElementByAntigen = dataElementsInfo.some(
                        de =>
                            dataElement.code.startsWith(de.code) &&
                            de.disaggregations.includes("antigen")
                    );
                    return isDataElementByAntigen;
                });

            return {
                id: getUid("section", dataSetId + antigen.id),
                // Sections code must be uniq across all datasets.
                // Make it unique by prefixing the antigen with dataset id
                code: `RVC_${dataSetId}-${getAntigenCode(antigen.code)}`,
                dataSet: { id: dataSetId },
                sortOrder: index + 1,
                name: sectionName,
                dataElements: dataElements2.map(de => ({ id: de.id })),
                greyedFields: greyedFields,
            };
        });

        const dataElements2 = _(disaggregationData)
            .flatMap(dd => {
                return getDisaggregatedDataElements(campaign, dd);
            })
            .map(de => de.formDataElement)
            .filter(dataElement => {
                const isDataElementByAntigen = dataElementsInfo.some(de =>
                    dataElement.code.startsWith(de.code)
                );
                return !isDataElementByAntigen;
            })
            .uniqBy(dataElement => dataElement.id)
            .value();

        const qualityAndSafetySection: Section | undefined =
            dataElements2.length > 0
                ? {
                      id: getUid("section", dataSetId),
                      name: "General Q&S",
                      dataSet: { id: dataSetId },
                      dataElements: dataElements2.map(de => ({ id: de.id })),
                      sortOrder: sectionsUsed.length + 1,
                  }
                : undefined;

        const sectionsUsed2 = _.compact([...sectionsUsed, qualityAndSafetySection]);

        return _.concat(sectionsUsed2);
    }

    private async getExistingDataSet(): Promise<Maybe<DataSetWithSections>> {
        const { campaign } = this;
        const { dataSets: existingDataSets } = campaign.id
            ? await campaign.db.getMetadata<{
                  dataSets: Array<DataSetWithSections>;
              }>({
                  dataSets: {
                      filters: [`id:eq:${campaign.id}`],
                      fields: {
                          dataEntryForm: { id: true },
                          sections: {
                              id: true,
                              name: true,
                              dataSet: { id: true },
                          },
                      },
                  },
              })
            : { dataSets: [] };

        return _.first(existingDataSets);
    }

    private async getDashboardMetadata(
        dataSetId: string,
        teamIds: string[]
    ): Promise<DashboardMetadata> {
        const { campaign } = this;
        const { db, config: metadataConfig } = campaign;
        const dashboardGenerator = Dashboard.build(db);

        if (!campaign.startDate || !campaign.endDate) {
            throw new Error("Campaign Dates not set");
        }
        const startDate = moment(campaign.startDate).startOf("day");
        const endDate = moment(campaign.endDate).endOf("day");

        const antigensDisaggregation = campaign.getEnabledAntigensDisaggregation();
        const sharing = await campaign.getDashboardSharing();

        return dashboardGenerator.create({
            campaign: campaign,
            dashboardId: campaign.dashboardId,
            datasetName: campaign.name,
            organisationUnits: campaign.organisationUnits,
            antigens: campaign.antigens,
            startDate,
            endDate,
            antigensDisaggregation,
            allCategoryIds: {
                ageGroup: this.ageGroupCategoryId,
                antigen: this.antigenCategoryId,
                teams: this.teamsCategoryId,
                doses: this.dosesCategoryId,
            },
            teamIds,
            metadataConfig,
            dashboardCode: getDashboardCode(metadataConfig, dataSetId),
            sharing,
        });
    }
}

type ModelWithAttributes = {
    attributeValues: Array<{
        attribute: { code: string };
        value: string;
    }>;
};

type DataSetWithDataInputPeriods = {
    dataInputPeriods: Array<{ period: { id: string } }>;
};

type CampaignPeriods = { startDate: Date; endDate: Date };

type CategoryOptionWithCategory = CategoryOption & { categoryCode: string };

type Reference = {
    category: AntigenDisaggregationEnabledDataElementCategory;
    categoryOption: CategoryOptionWithCategory;
    restrictForOptionIds: string[] | undefined;
};

// Return disaggregations, taking in account that some categories restrict
// the options that can be selected together (this is used to model age groups by dose)
function getDisaggregations(
    config: MetadataConfig,
    dataElementDis: AntigenDisaggregationEnabledDataElement,
    formDataElement: { code: string }
): CategoryOptionWithCategory[][] {
    const dis = getDataElementDisaggregations(formDataElement, config);
    const referencesGroups = _(dataElementDis.categories)
        .map(category => {
            const keep =
                !category.onlyForCategoryOptionIds ||
                !dis.dose?.categoryOption.id ||
                category.onlyForCategoryOptionIds.includes(dis.dose?.categoryOption.id);
            if (!keep) return null;

            return category.categoryOptions.map((categoryOption): Reference => {
                return {
                    category: category,
                    categoryOption: { ...categoryOption, categoryCode: category.code },
                    restrictForOptionIds: category.onlyForCategoryOptionIds,
                };
            });
        })
        .compact()
        .value();

    return _.cartesianProduct(referencesGroups).map(references => {
        const optionsIds = references.flatMap(ref => ref.categoryOption.id);

        const referencesFiltered = _(references)
            .groupBy(ref => ref.category.code)
            .values()
            .map(referencesGroup => {
                return _(referencesGroup).find(reference => {
                    return (
                        !reference.restrictForOptionIds ||
                        intersects(reference.restrictForOptionIds, optionsIds)
                    );
                });
            })
            .value();

        const referencesWithMatches = _.compact(referencesFiltered);

        // If some category had no matches, skip the product (this happens for unselected doses)
        return referencesFiltered.length === referencesWithMatches.length
            ? referencesWithMatches.map(reference => reference.categoryOption)
            : [];
    });
}

function intersects<T>(xs: T[], ys: T[]): boolean {
    return xs.some(x => ys.includes(x));
}

export function getDataInputFromCampaign(campaign: Campaign): Maybe<DataInput> {
    if (!campaign.startDate || !campaign.endDate) return;

    return {
        periodStart: formatDay(campaign.startDate),
        periodEnd: formatDay(campaign.endDate),
        openingDate: formatDay(campaign.startDate),
        closingDate: formatDay(campaign.endDate, { daysToAdd: campaign.config.expirationDays }),
    };
}

export function getCampaignPeriods<
    DataSet extends ModelWithAttributes & DataSetWithDataInputPeriods
>(dataSet: DataSet): Maybe<CampaignPeriods> {
    return getPeriodDatesFromAttributes(dataSet) || getPeriodDatesFromDataInputPeriods(dataSet);
}

function getPeriodDatesFromAttributes<DataSetWithAttributes extends ModelWithAttributes>(
    dataSet: DataSetWithAttributes
): Maybe<CampaignPeriods> {
    const dataInputAttribute = dataSet.attributeValues.find(
        av => av.attribute.code === baseConfig.attributeCodeForDataInputPeriods
    );
    if (!dataInputAttribute || !dataInputAttribute.value) return;

    const dataInput = JSON.parse(dataInputAttribute.value) as DataInput;

    return {
        startDate: new Date(dataInput.periodStart),
        endDate: new Date(dataInput.periodEnd),
    };
}

function getPeriodDatesFromDataInputPeriods(
    dataSet: DataSetWithDataInputPeriods
): Maybe<CampaignPeriods> {
    const { dataInputPeriods } = dataSet;
    if (!dataInputPeriods) return;

    const getDateFromPeriodId = (periodId: string) => moment(periodId, "YYYYMMDD").toDate();
    const periods = dataInputPeriods.map(dip => dip.period.id);
    const [min, max] = [_.min(periods), _.max(periods)];
    if (!min || !max) return;

    return {
        startDate: getDateFromPeriodId(min),
        endDate: getDateFromPeriodId(max),
    };
}
