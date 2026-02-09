/**
 * Migrate campaign data values (vaccination/population) to new disaggregations.
 *
 * Example of data value to migrate (name-suffixed fields are used for clarity):
 *
 * {
 *   "orgUnitName": "Health Center 1",
 *   "period": "20251211",
 *   "attributeOptionCombo": "Team 001 - Campaign A",
 *   "dataElementName": "Vaccine doses administered",
 *   "categoryOptionComboName": "Malaria, Dose 1, Preventive, 5 - 11 m",
 *   "value": "12",
 * }
 *
 * would be mapped to:
 *
 * {
 *   "orgUnitName": "Health Center 1",
 *   "period": "20251211",
 *   "attributeOptionCombo": "Team 001 - Campaign A",
 *   "dataElementName": "Vaccine doses administered - Malaria - Dose 1 - Preventive", // <= mapped
 *   "categoryOptionComboName": "5 - 11 m",  // <= mapped
 *   "value": "12",
 * }
 *
 * Notes:
 *
 * - Zero values ("0" or "0.00") are migrated if the data element is configured to store zero values,
 * - DHIS2 data values endpoint is not paginated, so chunk orgUnits as a paging-like mechanism
 */

import _ from "lodash";
import { array, command, flag, multioption, run, string } from "cmd-ts";
import {
    AppApi,
    getAppApi,
    getCampaignDataSets,
    getLogsArguments,
    getSourceTargetD2Args,
    setupLogsFromArgs,
} from "./utils";
import { D2Api, DataValueSetsDataValue } from "../types/d2-api";
import { promiseMap } from "../utils/promises";
import { assert, assertCondition, assertValue } from "../utils/assert";
import {
    DataElementInfo,
    dataElementsInfo,
    DisaggregationType,
    getDataElementFromDisaggregation,
} from "../models/D2CampaignMetadata";
import { fromPairs } from "../utils/lodash-mixins";
import { Ref } from "../models/db.types";
import { PairOf } from "../utils/typescript";
import { GetAntigenType } from "./GetAntigenType";
import Campaign from "../models/campaign";
import { CampaignD2Repository } from "../data/CampaignD2Repository";
import { CampaignRepository } from "../domain/repositories/CampaignRepository";

const program = command({
    name: "create-disaggregated-metadata",
    args: {
        ...getSourceTargetD2Args(),
        campaignIds: multioption({
            type: array(string),
            long: "campaign-id",
            description: "Campaign (data set) ID of the campaign to migrate",
        }),
        allCampaigns: flag({
            long: "all-campaigns",
            description: "Migrate all campaigns from source to target",
        }),
        post: flag({
            long: "post",
            description: "Actually post migrated data values to target DHIS2",
        }),
        ignoreCampaignPeriods: flag({
            long: "include-data-outside-campaign-period-boundaries",
            description: "Include also data values outside campaign period in the post",
        }),
        ...getLogsArguments(),
    },
    handler: async args => {
        if (args.campaignIds.length === 0 && !args.allCampaigns) {
            throw new Error("At least one --campaign-id or --all-campaigns must be provided");
        }
        setupLogsFromArgs(args);
        const apiSource = await getAppApi({ auth: args.sourceAuth, url: args.sourceUrl });
        const apiTarget = await getAppApi({ auth: args.targetAuth, url: args.targetUrl });
        const repo = new CampaignD2Repository(apiTarget.legacy.config, apiTarget.legacy.db);

        const campaignIds = args.allCampaigns
            ? (await getCampaignDataSets(apiSource.legacy)).map(c => c.id)
            : args.campaignIds;

        new MigrateData(repo, apiSource, apiTarget).execute({
            campaignIds: campaignIds,
            post: args.post,
            ignoreCampaignPeriods: args.ignoreCampaignPeriods,
        });
    },
});

run(program, process.argv.slice(2));

class MigrateData {
    orgUnitLevelProject = 4;
    zeroValues = ["0", "0.00"];

    // Check data element group "RVC - All Data Elements"
    sourceDataElementCampaignCodes = [
        "RVC_AEFI",
        "RVC_SAFETY_BOXES",
        "RVC_SYRINGES",
        "RVC_NEEDLES",
        "RVC_AEB",
        "RVC_DOSES_USED",
        "RVC_ADS_USED",
        "RVC_DOSES_ADMINISTERED",
    ];
    sourceDataElementPopulationCodes = [
        "RVC_AGE_DISTRIBUTION",
        "RVC_TOTAL_POPULATION",
        "RVC_POPULATION_BY_AGE",
    ];

    sourceDataElementCodes = [
        ...this.sourceDataElementCampaignCodes,
        ...this.sourceDataElementPopulationCodes,
    ];

    // These are the categories that can be mapped from source COC to disaggregated dataElements
    targetCategoriesMap: Record<string, DisaggregationType> = {
        RVC_ANTIGEN: "antigen",
        RVC_DOSE: "dose",
        RVC_TYPE: "campaignType",
    };

    // Category combos starting with "RVC_AGE_GROUP_" (include also "default" for no disaggregation)
    sourceCategoryComboIdentifiables = [
        "default",
        "RVC_SEVERITY",
        "RVC_AGE_GROUP",
        "RVC_AGE_GROUP_DISTATUS",
        "RVC_AGE_GROUP_DISTATUS_WS",
        "RVC_AGE_GROUP_GENDER",
        "RVC_AGE_GROUP_GENDER_DISTATUS",
        "RVC_AGE_GROUP_GENDER_DISTATUS_WS",
        "RVC_AGE_GROUP_GENDER_WS",
        "RVC_AGE_GROUP_WS",
    ];

    apiSource: D2Api;
    apiTarget: D2Api;

    constructor(
        private campaignRepository: CampaignRepository,
        appSource: AppApi,
        appTarget: AppApi
    ) {
        this.apiSource = appSource.d2Api;
        this.apiTarget = appTarget.d2Api;
    }

    async execute(options: {
        campaignIds: string[];
        post: boolean;
        ignoreCampaignPeriods: boolean;
    }): Promise<void> {
        await this.migrateCampaignsData(options);
    }

    private async getMappingOptions(options: {
        ignoreCampaignPeriods: boolean;
    }): Promise<Omit<MappingOptionsForCampaign, "sourceCocsMapping" | "campaign">> {
        const dataElementIdToCodeMapping = await this.getDataElementIdToCodeMapping();

        return {
            dataElementIdToCodeMapping: dataElementIdToCodeMapping,
            dataElementCodeToIdMapping: _.invert(dataElementIdToCodeMapping),
            targetCocsMapping: await this.getTargetCocsMapping(),
            targetDataElements: await this.getDataElements(this.apiTarget),
            getAntigenType: await GetAntigenType.init({ api: this.apiTarget }),
            ignoreCampaignPeriods: options.ignoreCampaignPeriods,
        };
    }

    async migrateCampaignsData(options: {
        campaignIds: string[];
        post: boolean;
        ignoreCampaignPeriods: boolean;
    }): Promise<void> {
        const mappingOptions = await this.getMappingOptions(options);

        for (const campaignId of options.campaignIds) {
            const campaign = await this.campaignRepository.get(campaignId);

            try {
                await this.migrateCampaign(campaign, mappingOptions, options);
            } catch (error) {
                console.error(
                    `Error migrating data for campaign ${campaign.id}: ${(error as Error).message}`
                );
            }
        }
    }

    private async migrateCampaign(
        campaign: Campaign,
        mappingOptions: Omit<MappingOptionsForCampaign, "sourceCocsMapping" | "campaign">,
        options: { post: boolean }
    ) {
        console.debug(`Migrating data for campaign: ${campaign.name} [${campaign.id}]`);

        const dataValues = await this.getDataValues(campaign, mappingOptions);

        const mappingOptionsFull: MappingOptionsForCampaign = {
            ...mappingOptions,
            campaign: campaign,
            sourceCocsMapping: await this.getSourceCocsMappingFromDataValues(dataValues),
        };

        const mappedDataValues = _(dataValues)
            .map(dataValue => this.mapDataValue(campaign, dataValue, mappingOptionsFull))
            .compact()
            .value();

        await this.postDataValues(mappedDataValues, options);
    }

    private async postDataValues(
        dataValues: DataValueSetsDataValue[],
        options: { post: boolean }
    ): Promise<void> {
        if (dataValues.length === 0) {
            return;
        } else if (!options.post) {
            console.debug(`--post not set, skip posting ${dataValues.length} data values`);
            return;
        } else {
            console.debug(`${dataValues.length} data values to post to target DHIS2`);

            for (const dataValuesChunk of _.chunk(dataValues, 1000)) {
                try {
                    await this.postDataValuesBatch(this.apiTarget, dataValuesChunk);
                } catch (err) {
                    console.error(
                        `Error posting values: ${(err as Error).message} - ${JSON.stringify(err)}`
                    );
                }
            }
        }
    }

    private async postDataValuesBatch(
        api: D2Api,
        dataValues: DataValueSetsDataValue[]
    ): Promise<void> {
        console.debug(`Posting batch of ${dataValues.length} data values`);

        const postResult = await api.dataValues
            .postSet({ force: true }, { dataValues: dataValues })
            .getData()
            .then(res => (res as unknown as { response: typeof res }).response);

        console.debug(`Posted: ${postResult.status} - ${JSON.stringify(postResult.importCount)}`);

        if (postResult.conflicts && postResult.conflicts.length > 0) {
            postResult.conflicts.forEach(conflict => {
                console.debug(`Conflict: ${JSON.stringify(conflict)}`);
            });
        }
    }

    private async getDataElementIdToCodeMapping() {
        const sourceDataElements = await this.getDataElements(this.apiSource);

        return _(sourceDataElements)
            .map((dataElement): [Id, Code] => [dataElement.id, dataElement.code])
            .fromPairs()
            .value();
    }

    private mapDataValue(
        campaign: Campaign,
        dataValue: DataValueSetsDataValue,
        options: MappingOptionsForCampaign
    ): DataValueSetsDataValue | null {
        const {
            dataElementIdToCodeMapping,
            sourceCocsMapping,
            targetCocsMapping,
            targetDataElements,
        } = options;

        const dataElementCodeSource = dataElementIdToCodeMapping[dataValue.dataElement];
        assertValue(dataElementCodeSource, `Unknown data element id: ${dataValue.dataElement}`);

        const dataElementInfo = dataElementsInfo.find(de => de.modelCode === dataElementCodeSource);

        if (!dataElementInfo) {
            // If we have no info, then data element is not disaggregated, return data value unchanged
            return dataValue;
        }

        // Control zero values: skip if zeros are not significant for the data element
        const isZeroValue = this.zeroValues.includes(dataValue.value);
        if (isZeroValue && !dataElementInfo.storeZeroDataValues) {
            return null;
        }

        const cocSource = sourceCocsMapping.getFromCocId(dataValue.categoryOptionCombo);
        assertValue(cocSource, `COC not found for COC=${dataValue.categoryOptionCombo}`);

        const targetDataElementDisaggregation = this.getTargetDataElementDisaggregation(
            campaign,
            cocSource,
            dataElementInfo,
            options
        );

        const targetDataElement = getDataElementFromDisaggregation(
            dataElementInfo,
            targetDataElements,
            targetDataElementDisaggregation
        );

        const optionsToKeep = _(cocSource.categoryOptions)
            .reject(categoryOption => !!this.targetCategoriesMap[categoryOption.category.code])
            .value();

        const targetCoc = targetCocsMapping.getForCategoryOptions(optionsToKeep, { dataValue });

        console.debug(
            [
                "map:",
                `[${dataElementCodeSource}: ${cocSource.name}] = ${dataValue.value}`,
                `->`,
                `[${targetDataElement.code}: ${targetCoc.name}]`,
            ].join(" ")
        );

        return {
            ...dataValue,
            dataElement: targetDataElement.id,
            categoryOptionCombo: targetCoc.id,
        };
    }

    private getTargetDataElementDisaggregation(
        campaign: Campaign,
        cocSource: SourceCoc,
        dataElementInfo: DataElementInfo,
        options: MappingOptionsForCampaign
    ): Partial<Record<DisaggregationType, string>> {
        const disaggregation: Partial<Record<DisaggregationType, string>> = fromPairs(
            _(cocSource.categoryOptions)
                .map((categoryOption): [DisaggregationType, string] | null => {
                    const disaggregationType =
                        this.targetCategoriesMap[categoryOption.category.code];
                    return disaggregationType
                        ? [disaggregationType, categoryOption.code || categoryOption.name]
                        : null;
                })
                .compact()
                .value()
        );

        // antigen and dose must be present; campaignType may be missing in old campaigns.

        assertCondition(
            dataElementInfo.disaggregations.includes("antigen") && disaggregation.antigen,
            `Antigen disaggregation missing for data element ${dataElementInfo.modelCode}`
        );

        assertCondition(
            !dataElementInfo.disaggregations.includes("dose") || disaggregation.dose,
            `Dose disaggregation missing for data element ${dataElementInfo.modelCode}`
        );

        const campaignTypeIsUnset =
            dataElementInfo.disaggregations.includes("campaignType") &&
            !disaggregation.campaignType;

        if (!campaignTypeIsUnset) {
            return disaggregation;
        } else {
            const type = options.getAntigenType.execute({
                campaign: campaign,
                antigenCode: assert(disaggregation.antigen),
            });

            const campaignTypeCode = type === "reactive" ? "RVC_REACTIVE" : "RVC_PREVENTIVE";
            return { ...disaggregation, campaignType: campaignTypeCode };
        }
    }

    private async getDataElements(api: D2Api): Promise<DataElement[]> {
        const metadata = await api.metadata
            .get({
                dataElements: {
                    fields: { id: true, code: true },
                    filter: { code: { $like: "RVC_" } },
                },
            })
            .getData();

        return metadata.dataElements;
    }

    private getDataElementIds(codes: string[], options: MappingOptionsGlobal): string[] {
        const dataElementIds = _(codes)
            .map(deCode => options.dataElementCodeToIdMapping[deCode])
            .compact()
            .value();

        assertValue(
            dataElementIds.length === codes.length,
            `Some data element IDs could not be mapped from codes: ${this.sourceDataElementCodes.join(
                ", "
            )}`
        );

        return dataElementIds;
    }

    private async getDataValues(
        campaign: Campaign,
        options: MappingOptionsGlobal
    ): Promise<DataValueSetsDataValue[]> {
        const orgUnitIds = campaign.organisationUnits.map(ou => ou.id);

        const dateOptions = {
            startDate: dateToDayString(campaign.startDate),
            endDate: dateToDayString(campaign.endDate),
        };

        // Vaccinations data + population data under the campaign orgunits
        const dataElementIds = this.getDataElementIds(this.sourceDataElementCodes, options);

        console.debug(
            `[${campaign.id}] Fetching data values for orgUnits: ${orgUnitIds.join(
                ", "
            )}: ${JSON.stringify(dateOptions)}`
        );

        const res = await this.apiSource.dataValues
            .getSet({
                dataSet: [],
                ["dataElement" as string]: dataElementIds,
                ...dateOptions,
                orgUnit: orgUnitIds,
            })
            .getData();

        const populationDataElementIds = this.getDataElementIds(
            this.sourceDataElementPopulationCodes,
            options
        );

        // We have other population data (total population, population by age) in higher levels.
        const orgUnitIdsForPopulation = _(campaign.organisationUnits)
            .map(ou => ou.path.split("/")[this.orgUnitLevelProject])
            .compact()
            .uniq()
            .value();

        console.debug(
            `[${
                campaign.id
            }] Fetching population data values for orgUnits: ${orgUnitIdsForPopulation.join(`, `)}`
        );

        const resPopulation = await this.apiSource.dataValues
            .getSet({
                dataSet: [],
                // prop dataElement: Id[] not implemented by this version of d2-api
                ["dataElement" as string]: populationDataElementIds,
                ...dateOptions,
                orgUnit: orgUnitIdsForPopulation,
                children: true,
            })
            .getData();

        const dataValuesOutSidePeriods = await this.getDataValuesOutsideCampaignPeriod(
            campaign,
            options
        );

        const campaignDataValues = options.ignoreCampaignPeriods
            ? _.concat(res.dataValues, dataValuesOutSidePeriods)
            : res.dataValues;

        const allDataValues = _.concat(campaignDataValues, resPopulation.dataValues);
        console.debug(`[${campaign.id}] Retrieved ${allDataValues.length} data values`);
        return allDataValues;
    }

    private async getDataValuesOutsideCampaignPeriod(
        campaign: Campaign,
        mappingOptions: MappingOptionsGlobal
    ): Promise<DataValueSetsDataValue[]> {
        const orgUnitIds = campaign.organisationUnits.map(ou => ou.id);
        const oneDayMsecs = 24 * 60 * 60 * 1000;
        const dataElementIds = this.getDataElementIds(
            this.sourceDataElementCampaignCodes,
            mappingOptions
        );

        const resBefore = await this.apiSource.dataValues
            .getSet({
                dataSet: [],
                ["dataElement" as string]: dataElementIds,
                startDate: "1950",
                endDate: dateToDayString(
                    new Date(assert(campaign.startDate).getTime() - oneDayMsecs)
                ),
                orgUnit: orgUnitIds,
            })
            .getData();

        const resAfter = await this.apiSource.dataValues
            .getSet({
                dataSet: [],
                ["dataElement" as string]: dataElementIds,
                startDate: dateToDayString(
                    new Date(assert(campaign.endDate).getTime() + oneDayMsecs)
                ),
                endDate: new Date().getFullYear().toString(),
                orgUnit: orgUnitIds,
            })
            .getData();

        const dataValuesOutsidePeriod = _(resBefore.dataValues)
            .concat(resAfter.dataValues)
            .reject(dv => this.zeroValues.includes(dv.value))
            .value();

        const outsidePeriods = _(dataValuesOutsidePeriod)
            .map(dv => dv.period)
            .uniq()
            .sort()
            .value();

        // Log data values outside campaign period

        if (dataValuesOutsidePeriod.length > 0) {
            console.debug(
                `[${campaign.id}] Found ${
                    dataValuesOutsidePeriod.length
                } data values (${periodToDate(_.first(outsidePeriods))} -> ${periodToDate(
                    _.last(outsidePeriods)
                )}) outside campaign period (${dateToDayString(
                    campaign.startDate
                )} -> ${dateToDayString(campaign.endDate)})`
            );

            dataValuesOutsidePeriod.forEach(dv => {
                console.debug(
                    `  - [${campaign.id}] [outside] ou=${dv.orgUnit} de=${dv.dataElement} coc=${dv.categoryOptionCombo} aoc=${dv.attributeOptionCombo} p=${dv.period} value=${dv.value}`
                );
            });
        }

        return dataValuesOutsidePeriod;
    }

    private async getTargetCocsMapping(): Promise<TargetCocsMapping> {
        const { categoryCombos } = await this.apiTarget.metadata
            .get({
                categoryCombos: {
                    fields: {
                        id: true,
                        name: true,
                        code: true,
                        categoryOptionCombos: {
                            id: true,
                            name: true,
                            categoryOptions: { id: true },
                        },
                    },
                    filter: { identifiable: { in: this.sourceCategoryComboIdentifiables } },
                },
            })
            .getData();

        return TargetCocsMapping.fromCategoryCombos(categoryCombos);
    }

    private async getSourceCocsMappingFromDataValues(
        dataValues: DataValueSetsDataValue[]
    ): Promise<SourceCocsMapping> {
        const cocIds = _(dataValues)
            .map(dv => dv.categoryOptionCombo)
            .uniq()
            .value();

        if (cocIds.length === 0) {
            return SourceCocsMapping.fromCategoryOptionCombos([]);
        }

        console.debug(`Build COC map for ${cocIds.length} COCs`);

        const cocsList = await promiseMap(_.chunk(cocIds, 300), async chunkCocIds => {
            const { categoryOptionCombos } = await this.apiSource.metadata
                .get({
                    categoryOptionCombos: {
                        fields: {
                            id: true,
                            name: true,
                            categoryOptions: {
                                id: true,
                                name: true,
                                code: true,
                                categories: { code: true },
                            },
                        },
                        filter: { id: { in: chunkCocIds } },
                    },
                })
                .getData();

            return categoryOptionCombos;
        });

        const cocs = _.flatten(cocsList);
        return SourceCocsMapping.fromCategoryOptionCombos(cocs);
    }
}

/* Source COCs mapping */

type SourceCocsMapping_ = Record<CocId, SourceCoc>;
type SourceCoc = { id: CocId; name: string; categoryOptions: CategoryOption[] };
type CocId = string;
type CategoryOption = { id: string; name: string; code: string; category: { code: string } };

type SourceCocsData = {
    id: string;
    name: string;
    categoryOptions: Array<{
        id: string;
        name: string;
        code: string;
        categories: Array<{ code: string }>;
    }>;
};

class SourceCocsMapping {
    private constructor(private mapping: SourceCocsMapping_) {}

    static fromCategoryOptionCombos(cocs: SourceCocsData[]): SourceCocsMapping {
        const cocMapping = _(cocs)
            .map((coc): PairOf<SourceCocsMapping_> => {
                if (coc.name === "default") {
                    return [coc.id, { id: coc.id, name: coc.name, categoryOptions: [] }];
                }

                const categoryOptions = coc.categoryOptions.map(categoryOption => {
                    const categories = categoryOption.categories.filter(category =>
                        category.code?.startsWith("RVC_")
                    );
                    const category = categories[0];
                    assertValue(category, `Expected a category for option: ${categoryOption.id}`);
                    assertCondition(
                        categories.length === 1,
                        `Expected exactly one category per  option: ${categoryOption.id}`
                    );
                    return { ...categoryOption, category: category };
                });

                const sourceCoc: SourceCoc = {
                    id: coc.id,
                    name: coc.name,
                    categoryOptions: categoryOptions,
                };

                return [coc.id, sourceCoc];
            })
            .fromPairs()
            .value();

        return new SourceCocsMapping(cocMapping);
    }

    getFromCocId(cocId: string): SourceCoc | undefined {
        return this.mapping[cocId];
    }
}

/* Target COCs mapping */

type CategoryOptionsKey = string; // Sorted dot-joined category option IDs `id1.id2.id3`
type CocsMapping_ = Map<CategoryOptionsKey, TargetCoc>;
type CategoryCombo = { name: string; categoryOptionCombos: Array<TargetCoc> };
type TargetCoc = { id: string; name: string; categoryOptions: Array<{ id: string }> };

class TargetCocsMapping {
    private constructor(private cocsMapping: CocsMapping_) {}

    static fromCategoryCombos(categoryCombos: CategoryCombo[]): TargetCocsMapping {
        const pairs = categoryCombos.flatMap(categoryCombo => {
            const isDefaultCatCombo = categoryCombo.name === "default";

            return categoryCombo.categoryOptionCombos.map(
                (coc): [CategoryOptionsKey, TargetCoc] => {
                    const categoryOptionsId = this.getCategoryOptionsId(coc.categoryOptions);
                    return [isDefaultCatCombo ? "default" : categoryOptionsId, coc];
                }
            );
        });

        return new TargetCocsMapping(new Map(pairs));
    }

    private static getCategoryOptionsId(categoryOptions: Ref[]): CategoryOptionsKey {
        return (
            _(categoryOptions)
                .map(co => co.id)
                .sort()
                .join(".") || "default"
        );
    }

    getForCategoryOptions(
        categoryOptions: Ref[],
        options: { dataValue: DataValueSetsDataValue }
    ): TargetCoc {
        const key = TargetCocsMapping.getCategoryOptionsId(categoryOptions);
        const categoryOptionCombo = this.cocsMapping.get(key);
        assertValue(
            categoryOptionCombo,
            [
                `COC not found (key=${key}): ${JSON.stringify(categoryOptions)}`,
                JSON.stringify(options.dataValue),
            ].join("\n")
        );
        return categoryOptionCombo;
    }
}

/* Mapping options */

type Id = string;
type Code = string;
type DataElement = { id: string; code: string };

type MappingOptionsGlobal = {
    dataElementIdToCodeMapping: Record<Id, Code>;
    dataElementCodeToIdMapping: Record<Code, Id>;
    targetCocsMapping: TargetCocsMapping;
    targetDataElements: DataElement[];
    getAntigenType: GetAntigenType;
    ignoreCampaignPeriods: boolean;
};

type MappingOptionsForCampaign = MappingOptionsGlobal & {
    campaign: Campaign;
    sourceCocsMapping: SourceCocsMapping;
};

// Date(YYYY-MM-DD) -> "YYYY-MM-DD"
function dateToDayString(date: Date | null): string {
    if (!date) return "-";
    return date.toISOString().slice(0, 10);
}

// "20251211" -> "2025-12-11"
function periodToDate(period: string | undefined): string {
    if (!period) return "-";
    return `${period.slice(0, 4)}-${period.slice(4, 6)}-${period.slice(6, 8)}`;
}
