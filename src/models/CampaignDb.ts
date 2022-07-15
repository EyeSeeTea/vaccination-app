import DbD2, { ApiResponse, ModelReference } from "./db-d2";
import { generateUid } from "d2/uid";
import moment from "moment";
import _ from "lodash";
import "../utils/lodash-mixins";

import Campaign from "./campaign";
import { DataSetCustomForm } from "./DataSetCustomForm";
import {
    Maybe,
    MetadataResponse,
    DataEntryForm,
    Section,
    CampaignDisaggregation,
    getCampaignDisaggregationItemId,
} from "./db.types";
import { Metadata, DataSet, Response } from "./db.types";
import { getDaysRange, toISOStringNoTZ } from "../utils/date";
import {
    getDataElements,
    CocMetadata,
    AntigenDisaggregationEnabled,
} from "./AntigensDisaggregation";
import { Dashboard, DashboardMetadata } from "./Dashboard";
import { Teams, CategoryOptionTeam } from "./Teams";
import {
    getDashboardCode,
    getByIndex,
    MetadataConfig,
    baseConfig,
    categoryComboTypeMapping,
} from "./config";
import { config } from "process";

interface DataSetWithSections {
    sections: Array<{ id: string; name: string; dataSet: { id: string } }>;
    dataEntryForm: { id: string };
}

interface PostSaveMetadata {
    visualizations: object[];
    dashboards: object[];
    dataSets: DataSet[];
    dataEntryForms: DataEntryForm[];
    sections: Section[];
    categoryOptions: object[];
}

export default class CampaignDb {
    antigenCategoryId: string;
    ageGroupCategoryId: string;
    teamsCategoryId: string;
    dosesCategoryId: string;

    constructor(public campaign: Campaign) {
        const { categories, categoryCombos, categoryCodeForAgeGroup } = campaign.config;
        const {
            categoryCodeForTeams,
            categoryCodeForDoses,
            categoryCodeForAntigens,
        } = campaign.config;
        const categoriesByCode = _(categories).keyBy("code");

        this.ageGroupCategoryId = categoriesByCode.getOrFail(categoryCodeForAgeGroup).id;
        this.teamsCategoryId = categoriesByCode.getOrFail(categoryCodeForTeams).id;
        this.dosesCategoryId = categoriesByCode.getOrFail(categoryCodeForDoses).id;
        this.antigenCategoryId = categoriesByCode.getOrFail(categoryCodeForAntigens).id;
    }

    public async createDashboard(): Promise<string> {
        if (!this.campaign.id) throw new Error("Cannot create dashboard for unpersisted campaign");
        const teamIds = this.campaign.teamsMetadata.elements.map(t => t.id);
        const dashboardMetadata = await this.getDashboardMetadata(this.campaign.id, teamIds);
        const metadata: PostSaveMetadata = {
            ...dashboardMetadata,
            dataSets: [],
            dataEntryForms: [],
            sections: [],
            categoryOptions: [],
        };
        const response = await this.postSave(metadata, []);
        const dashboard = dashboardMetadata.dashboards[0];

        if (!response.status || !dashboard || !dashboard.id) {
            throw new Error("Error creating dashboard");
        } else {
            return dashboard.id;
        }
    }

    public async save(): Promise<Response<string>> {
        const { campaign } = this;
        const { config } = campaign;
        const { db, config: metadataConfig, teamsMetadata } = campaign;
        const dataSetId = campaign.id || generateUid();

        if (!campaign.startDate || !campaign.endDate) {
            return { status: false, error: "Campaign Dates not set" };
        }
        const startDate = moment(campaign.startDate).startOf("day");
        const endDate = moment(campaign.endDate).endOf("day");

        const teamGenerator = Teams.build(teamsMetadata);
        const newTeams = teamGenerator.getTeams({
            teams: campaign.teams || 0,
            name: campaign.name,
            organisationUnits: campaign.organisationUnits,
            teamsCategoyId: this.teamsCategoryId,
            startDate,
            endDate,
            isEdit: campaign.isEdit(),
        });

        const teamsToDelete = _.differenceBy(teamsMetadata.elements, newTeams, "id");

        const disaggregationData = campaign.getEnabledAntigensDisaggregation();
        const dataElements = getDataElements(metadataConfig, disaggregationData);

        const dataSetElements = dataElements.map(dataElement => ({
            dataSet: { id: dataSetId },
            dataElement: { id: dataElement.id },
            categoryCombo: { id: dataElement.categoryCombo.id },
        }));
        /* Problem: When syncing data from field servers to HQ, data cannot usually be imported
           because the current time is after the closing date of the data input periods. 

           Workaround: Remove the closing date.
        */

        //const closingDate = endDate.clone().add(metadataConfig.expirationDays, "days");

        const dataInputPeriods = getDaysRange(startDate, endDate).map(date => ({
            period: { id: date.format("YYYYMMDD") },
            openingDate: toISOStringNoTZ(startDate),
            //closingDate: toISOStringNoTZ(closingDate),
        }));

        const existingDataSet = await this.getExistingDataSet();
        const metadataCoc = await campaign.antigensDisaggregation.getCocMetadata(db);
        const dataEntryForm = await this.getDataEntryForm(existingDataSet, metadataCoc);
        const sections = await this.getSections(db, dataSetId, existingDataSet, metadataCoc);
        const sharing = await campaign.getDataSetSharing();
        const campaignDisaggregation = this.getCampaignDisaggregation(disaggregationData);

        const categoryComboCode =
            categoryComboTypeMapping[campaign.type] || config.categoryComboCodeForReactive;
        const categoryComboId = getByIndex(config.categoryCombos, "code", categoryComboCode).id;

        const dataSet: DataSet = {
            id: dataSetId,
            name: campaign.name,
            description: campaign.description,
            periodType: "Daily",
            categoryCombo: { id: categoryComboId },
            dataElementDecoration: true,
            renderAsTabs: true,
            organisationUnits: campaign.organisationUnits.map(ou => ({ id: ou.id })),
            dataSetElements,
            openFuturePeriods: 1,
            timelyDays: 0,
            expiryDays: 0,
            formType: "CUSTOM",
            dataInputPeriods,
            attributeValues: [
                { value: "true", attribute: { id: metadataConfig.attributes.app.id } },
                { value: "true", attribute: { id: metadataConfig.attributes.hideInTallySheet.id } },
                {
                    value: JSON.stringify(campaignDisaggregation),
                    attribute: { id: metadataConfig.attributes.dataSetCampaignDisaggregation.id },
                },
            ],
            dataEntryForm: { id: dataEntryForm.id },
            sections: sections.map(section => ({ id: section.id })),
            ...sharing,
        };

        const teamIds = newTeams.map(t => t.id);
        const dashboardMetadata = await this.getDashboardMetadata(dataSetId, teamIds);

        return this.postSave(
            {
                ...dashboardMetadata,
                dataSets: [dataSet],
                dataEntryForms: [dataEntryForm],
                sections,
                categoryOptions: newTeams,
            },
            teamsToDelete
        );
    }

    private getCampaignDisaggregation(
        disaggregationData: AntigenDisaggregationEnabled
    ): CampaignDisaggregation {
        const { config } = this.campaign;
        const categoriesByCode = _.keyBy(config.categories, category => category.code);

        const campaignDisaggregation = _.flatMap(disaggregationData, data => {
            return _.flatMap(data.dataElements, dataElement => {
                return _.flatMap(dataElement.categories, category => {
                    const configCategory = categoriesByCode[category.code];

                    if (!configCategory || category.code === config.categoryCodeForAntigens)
                        return [];

                    const categoryOptionIdsByName = _(configCategory.categoryOptions)
                        .keyBy(co => co.displayName)
                        .mapValues(co => co.id)
                        .value();

                    return category.categoryOptions.map(categoryOption => {
                        return {
                            antigen: data.antigen.id,
                            dataElement: dataElement.id,
                            category: configCategory.id,
                            categoryOption: categoryOptionIdsByName[categoryOption],
                        };
                    });
                });
            });
        });

        return _.sortBy(campaignDisaggregation, getCampaignDisaggregationItemId);
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
        teamsToDelete: CategoryOptionTeam[]
    ): Promise<Response<string>> {
        const { campaign } = this;
        const { db, config } = campaign;
        const { sections, ...nonSectionsMetadata } = allMetadata;
        let metadata;
        let modelReferencesToDelete: ModelReference[];

        if (campaign.isEdit()) {
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
            modelReferencesToDelete = await Campaign.getResources(config, db, allMetadata.dataSets);
        } else {
            metadata = allMetadata;
            modelReferencesToDelete = [];
        }

        const result: ApiResponse<MetadataResponse> = await db.postMetadata<Metadata>(metadata);

        if (campaign.isEdit()) {
            await this.cleanUpDashboardItems(db, modelReferencesToDelete);

            // Teams must be deleted after all asociated dashboard and dashboard items (favorites) are deleted
            if (!_.isEmpty(teamsToDelete)) {
                await Teams.deleteTeams(db, teamsToDelete);
            }
        }
        // Update Team Category with new categoryOptions (teams)
        Teams.updateTeamCategory(db, allMetadata.categoryOptions, teamsToDelete, config);

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
        modelReferencesToDelete: ModelReference[]
    ): Promise<Response<string>> {
        const dashboardItems = _(modelReferencesToDelete)
            .filter(o => _.includes(["visualizations"], o.model))
            .value();

        return await db.deleteMany(dashboardItems);
    }

    private async getSections(
        db: DbD2,
        dataSetId: string,
        existingDataSet: Maybe<DataSetWithSections>,
        cocMetadata: CocMetadata
    ): Promise<Section[]> {
        const { campaign } = this;
        const existingSections = existingDataSet ? existingDataSet.sections : [];
        const existingSectionsByName = _.keyBy(existingSections, "name");
        const disaggregationData = campaign.getEnabledAntigensDisaggregation();

        const sectionsUsed: Section[] = disaggregationData.map((disaggregationData, index) => {
            const sectionName = disaggregationData.antigen.code;
            // !NAME -> Old unused section
            const existingSection =
                existingSectionsByName[sectionName] || existingSectionsByName["!" + sectionName];

            return {
                id: existingSection ? existingSection.id : generateUid(),
                dataSet: { id: dataSetId },
                sortOrder: index,
                name: sectionName,
                dataElements: disaggregationData.dataElements.map(de => ({ id: de.id })),
                // Previously we used greyedFields for disaggregation, but now we use a
                // custom attribute instead
                greyedFields: [],
            };
        });

        const existingSectionsUnused = _(existingSections)
            .differenceBy(sectionsUsed, "id")
            .map(section =>
                section.name.startsWith("!") ? section : { ...section, name: "!" + section.name }
            )
            .value();

        return _.concat(sectionsUsed, existingSectionsUnused);
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

    private async getDataEntryForm(
        existingDataSet: Maybe<DataSetWithSections>,
        cocMetadata: CocMetadata
    ): Promise<DataEntryForm> {
        const { campaign } = this;
        const customForm = await DataSetCustomForm.build(campaign, cocMetadata);
        const customFormHtml = customForm.generate();
        const formId =
            (existingDataSet &&
                existingDataSet.dataEntryForm &&
                existingDataSet.dataEntryForm.id) ||
            generateUid();

        return {
            id: formId,
            name: campaign.name + " " + formId, // dataEntryForm.name must be unique
            htmlCode: customFormHtml,
            style: "NONE",
        };
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
