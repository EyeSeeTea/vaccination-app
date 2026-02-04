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
import { AppApi, getAppApi, getCampaignDataSets, getSourceTargetD2Args } from "./utils";
import { D2Api, DataValueSetsDataValue } from "../types/d2-api";
import { promiseMap } from "../utils/promises";
import { assertCondition, assertValue } from "../utils/assert";
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

const program = command({
    name: "create-disaggregated-metadata",
    args: {
        ...getSourceTargetD2Args(),
        orgUnitIds: multioption({
            type: array(string),
            long: "orgunit-ids",
            description: "Organisation Unit IDs to migrate (all children will be included)",
        }),
        post: flag({
            long: "post",
            description: "Actually post migrated data values to target DHIS2",
        }),
    },
    handler: async args => {
        const apiSource = await getAppApi({ auth: args.sourceAuth, url: args.sourceUrl });
        const apiTarget = await getAppApi({ auth: args.targetAuth, url: args.targetUrl });
        new MigrateData(apiSource, apiTarget).execute(args);
    },
});

run(program, process.argv.slice(2));

class MigrateData {
    // Check data element group "RVC - All Data Elements"
    sourceDataElementCodes = [
        "RVC_AEFI",
        "RVC_SAFETY_BOXES",
        "RVC_SYRINGES",
        "RVC_NEEDLES",
        "RVC_AEB",
        "RVC_DOSES_USED",
        "RVC_ADS_USED",
        "RVC_DOSES_ADMINISTERED",
        "RVC_AGE_DISTRIBUTION",
        "RVC_TOTAL_POPULATION",
        "RVC_POPULATION_BY_AGE",
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

    constructor(private appSource: AppApi, appTarget: AppApi) {
        this.apiSource = appSource.d2Api;
        this.apiTarget = appTarget.d2Api;
    }

    async execute(options: { orgUnitIds: string[]; post: boolean }): Promise<void> {
        await this.migrateCampaignsData(options);
    }

    private async getMappingOptions(): Promise<Omit<MappingOptions, "sourceCocsMapping">> {
        const dataElementIdToCodeMapping = await this.getDataElementIdToCodeMapping();
        const { legacy } = this.appSource;
        const dataSets = await getCampaignDataSets(legacy);

        const orgUnitToCampaignMapping: Record<string, CampaignRef> = _(dataSets)
            .flatMap(dataSet => {
                return dataSet.organisationUnits.map(orgUnit => {
                    return [orgUnit.id, { id: dataSet.id, name: dataSet.name }];
                });
            })
            .fromPairs()
            .value();

        return {
            dataElementIdToCodeMapping: dataElementIdToCodeMapping,
            dataElementCodeToIdMapping: _.invert(dataElementIdToCodeMapping),
            targetCocsMapping: await this.getTargetCocsMapping(),
            targetDataElements: await this.getDataElements(this.apiTarget),
            getAntigenType: await GetAntigenType.init({ api: this.apiTarget }),
            orgUnitToCampaignMapping: orgUnitToCampaignMapping,
        };
    }

    async migrateCampaignsData(options: { orgUnitIds: string[]; post: boolean }): Promise<void> {
        console.debug(`Get data values from source: orgUnitIds=${options.orgUnitIds.join(", ")}`);
        const mappingOptions = await this.getMappingOptions();
        const { dataElementCodeToIdMapping } = mappingOptions;

        const orgUnitIdsGroups = await this.getChunkedOrgUnits({
            parentOrgUnitIds: options.orgUnitIds,
            chunkSize: 10,
        });

        await promiseMap(orgUnitIdsGroups, async orgUnitIds => {
            const dataValues = await this.getDataValues(orgUnitIds, dataElementCodeToIdMapping);

            const mappingOptionsFull: MappingOptions = {
                ...mappingOptions,
                sourceCocsMapping: await this.getSourceCocsMappingFromDataValues(dataValues),
            };

            const mappedDataValues = _(dataValues)
                .map(dataValue => this.mapDataValue(dataValue, mappingOptionsFull))
                .compact()
                .value();

            await this.postDataValues(mappedDataValues, options);
        });
    }

    // data values endpoint cannot be paginated (we have param <limit> for not <page> or some kind
    // of stable ordering that would allow a manual paginated). So we use chunks of orgUnitIds to limit
    // the number of data values retrieved per request.
    // As we get descendants, first get all org units and chunk those
    private async getChunkedOrgUnits(options: {
        parentOrgUnitIds: Id[];
        chunkSize: number;
    }): Promise<Array<Id[]>> {
        const pageSize = 1000;

        // For each parent, get paginated descendants, merge them all, flatten and finally chunk
        const orgUnitGroups = await promiseMap(options.parentOrgUnitIds, async parentOrgUnitId => {
            const { pager } = await this.apiSource.models.organisationUnits
                .get({
                    fields: { id: true },
                    filter: { path: { like: parentOrgUnitId } },
                    page: 1,
                    pageSize: 0,
                })
                .getData();

            const pagesCount = Math.ceil(pager.total / pageSize);
            console.debug(`Tree from orgUnit.id=${parentOrgUnitId} has ${pager.total} descendants`);

            const orgUnitGroups = await promiseMap(_.range(1, pagesCount + 1), async page => {
                const metadata = await this.apiSource.models.organisationUnits
                    .get({
                        fields: { id: true },
                        filter: { path: { like: parentOrgUnitId } },
                        page: page,
                        pageSize: pageSize,
                    })
                    .getData();

                return metadata.objects.map(ou => ou.id);
            });

            return _.flatten(orgUnitGroups);
        });

        return _(orgUnitGroups).flatten().chunk(options.chunkSize).value();
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
            console.debug(`Posting ${dataValues.length} data values to target DHIS2`);

            try {
                const postResult = await this.apiTarget.dataValues
                    .postSet({ force: true }, { dataValues: dataValues })
                    .getData()
                    .then(res => (res as unknown as { response: typeof res }).response);

                console.debug(
                    `Posted: ${postResult.status} - ${JSON.stringify(postResult.importCount)}`
                );

                if (postResult.conflicts && postResult.conflicts.length > 0) {
                    postResult.conflicts.forEach(conflict => {
                        console.debug(`Conflict: ${JSON.stringify(conflict)}`);
                    });
                }
            } catch (err) {
                console.error(
                    `Error posting data values: ${(err as Error).message} - ${JSON.stringify(err)}`
                );
            }
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
        dataValue: DataValueSetsDataValue,
        options: MappingOptions
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
        const zeroValues = ["0", "0.00"];
        const isZeroValue = zeroValues.includes(dataValue.value);
        if (isZeroValue && !dataElementInfo.storeZeroDataValues) {
            console.debug(`Skipping zero value for ${dataElementCodeSource}`);
            return null;
        }

        const cocSource = sourceCocsMapping.getFromCocId(dataValue.categoryOptionCombo);
        assertValue(cocSource, `COC not found for COC=${dataValue.categoryOptionCombo}`);

        const targetDataElementDisaggregation = this.getTargetDataElementDisaggregation(
            dataValue,
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
        dataValue: DataValueSetsDataValue,
        cocSource: SourceCoc,
        dataElementInfo: DataElementInfo,
        options: MappingOptions
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
            // Old campaigns may have antigens with no campaign type.
            // If the antigen is listed in "Antigen Type Selectable", assume REACTIVE, else PREVENTIVE.
            const campaign = options.orgUnitToCampaignMapping[dataValue.orgUnit];

            const type = options.getAntigenType.execute({
                campaign: campaign,
                antigenCode: disaggregation.antigen || "",
                fallback: "preventive",
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

    private async getDataValues(
        orgUnitIds: string[],
        dataElementCodeToIdMapping: Record<Code, Id>
    ): Promise<DataValueSetsDataValue[]> {
        const dataElementIds = _(this.sourceDataElementCodes)
            .map(deCode => dataElementCodeToIdMapping[deCode])
            .compact()
            .value();

        assertValue(
            dataElementIds.length === this.sourceDataElementCodes.length,
            `Some data element IDs could not be mapped from codes: ${this.sourceDataElementCodes.join(
                ", "
            )}`
        );
        console.debug(`Fetching data values for orgUnits: ${orgUnitIds.join(", ")}`);

        const res = await this.apiSource.dataValues
            .getSet({
                dataSet: [],
                // prop dataElement: Id[] not implemented by this version of d2-api
                ["dataElement" as string]: dataElementIds,
                startDate: (new Date().getFullYear() - 50).toString(),
                endDate: (new Date().getFullYear() + 50).toString(),
                orgUnit: orgUnitIds,
                children: false, // already getting descendants orgUnits
            })
            .getData();

        console.debug(`Retrieved ${res.dataValues.length} data values`);

        return res.dataValues;
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

type CampaignRef = { id: string; name: string };

type MappingOptions = {
    dataElementIdToCodeMapping: Record<Id, Code>;
    dataElementCodeToIdMapping: Record<Code, Id>;
    sourceCocsMapping: SourceCocsMapping;
    targetCocsMapping: TargetCocsMapping;
    targetDataElements: DataElement[];
    getAntigenType: GetAntigenType;
    orgUnitToCampaignMapping: Record<Id, CampaignRef>;
};
