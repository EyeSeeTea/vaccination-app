import _ from "lodash";
import "../utils/lodash-mixins";
import DbD2 from "./db-d2";
import {
    Category,
    DataElementGroup,
    CategoryCombo,
    CategoryOptionGroup,
    DataElement,
    OrganisationUnitLevel,
    Ref,
    CategoryOption,
    CategoryOptionCombo,
    Attribute,
    NamedObject,
    Indicator,
    getId,
    getCode,
} from "./db.types";
import { sortAgeGroups } from "../utils/age-groups";

export const userRoles = {
    app: "RVC App: Access",
    campaignManager: "RVC App: Campaign Manager",
    feedback: "RVC App: Feedback",
    fieldUser: "Position: Field User",
    medicalFocalPoint: "Position: Medical Focal Point",
    onlineDataEntry: "Data Entry: Online Edit",
};

export const baseConfig = {
    expirationDays: 8,
    categoryCodeForAntigens: "RVC_ANTIGEN",
    categoryCodeForAgeGroup: "RVC_AGE_GROUP",
    categoryCodeForCampaignType: "RVC_TYPE",
    categoryCodeForDoses: "RVC_DOSE",
    categoryComboCodeForAgeGroup: "RVC_AGE_GROUP",
    categoryComboCodeForAntigenAgeGroup: "RVC_ANTIGEN_AGE_GROUP",
    categoryComboCodeForAntigenDosesAgeGroup: "RVC_ANTIGEN_DOSE_AGE_GROUP",
    categoryComboCodeForAntigenDosesAgeGroupType: "RVC_ANTIGEN_DOSE_AGE_GROUP_TYPE",
    dataElementGroupCodeForAntigens: "RVC_ANTIGEN",
    dataElementGroupCodeForPopulation: "RVC_POPULATION",
    categoryComboCodeForTeams: "RVC_TEAM",
    categoryCodeForTeams: "RVC_TEAM",
    categoryOptionCodeReactive: "RVC_REACTIVE",
    categoryOptionCodePreventive: "RVC_PREVENTIVE",
    categoryOptionGroupOfAntigensWithSelectableType: "RVC_ANTIGEN_TYPE_SELECTABLE",
    legendSetsCode: "RVC_LEGEND_ZERO",
    attributeCodeForApp: "RVC_CREATED_BY_VACCINATION_APP",
    attributeNameForHideInTallySheet: "hideInTallySheet",
    attributeCodeForDataInputPeriods: "RVC_DATA_INPUT_PERIODS",
    dataElementCodeForTotalPopulation: "RVC_TOTAL_POPULATION",
    dataElementCodeForAgeDistribution: "RVC_AGE_DISTRIBUTION",
    dataElementCodeForPopulationByAge: "RVC_POPULATION_BY_AGE",
    dataSetDashboardCodePrefix: "RVC_CAMPAIGN",
    dataSetExtraCodes: ["DS_NSd_3"],
    userRoleNames: {
        manager: [userRoles.campaignManager],
        feedback: [userRoles.feedback],
        targetPopulation: [
            userRoles.medicalFocalPoint,
            userRoles.fieldUser,
            userRoles.onlineDataEntry,
        ],
    },
};

type BaseConfig = typeof baseConfig;

export interface MetadataConfig extends BaseConfig {
    currentUser: User;
    userRoles: NamedObject[];
    attributes: {
        app: Attribute;
        hideInTallySheet: Attribute;
        dataInputPeriods: Attribute;
    };
    organisationUnitLevels: OrganisationUnitLevel[];
    categories: Category[];
    categoriesDisaggregation: Array<{
        name: string;
        code: string;
        dataDimensionType: "DISAGGREGATION" | "ATTRIBUTE";
        dataDimension: boolean;
        $categoryOptions:
            | { kind: "fromAntigens" }
            | { kind: "fromAgeGroups" }
            | { kind: "fromDoses" }
            | { kind: "values"; values: CategoryOption[] };
    }>;
    defaults: {
        categoryOptionCombo: CategoryOptionCombo;
    };
    categoryOptions: CategoryOption[];
    categoryCombos: CategoryCombo[];
    population: {
        dataElementGroup: DataElementGroup;
        totalPopulationDataElement: DataElement;
        ageDistributionDataElement: DataElement;
        populationByAgeDataElement: DataElement;
        ageGroupCategory: Category;
    };
    dataElements: DataElement[];
    dataElementsDisaggregation: Array<{
        name: string;
        code: string;
        id: string;
        categories: Record<AntigenCode, Array<{ code: string; optional: boolean }>>;
    }>;
    indicators: Indicator[];
    antigens: Array<{
        id: string;
        name: string;
        displayName: string;
        code: string;
        dataElements: { id: string; code: string; optional: boolean; order: number }[];
        ageGroups: Array<CategoryOption[][]>;
        doses: Array<{ id: string; code: string; name: string; displayName: string }>;
        isTypeSelectable: boolean;
    }>;
    legendSets: Array<{
        id: string;
    }>;
    dataSets: {
        extraActivities: DataSet[];
    };
}

export type DataSet = { id: string; name: string; code: string };

export type User = {
    id: string;
    name: string;
};

function getCategoriesDisaggregation(
    categories: Category[]
): MetadataConfig["categoriesDisaggregation"] {
    return categories.map(category => {
        let $categoryOptions: MetadataConfig["categoriesDisaggregation"][0]["$categoryOptions"];

        if (category.code === baseConfig.categoryCodeForAntigens) {
            $categoryOptions = { kind: "fromAntigens" };
        } else if (category.code === baseConfig.categoryCodeForAgeGroup) {
            $categoryOptions = { kind: "fromAgeGroups" };
        } else if (category.code === baseConfig.categoryCodeForDoses) {
            $categoryOptions = { kind: "fromDoses" };
        } else {
            $categoryOptions = {
                kind: "values",
                values: category.categoryOptions,
            };
        }

        return {
            id: category.id,
            name: category.displayName,
            code: category.code,
            dataDimensionType: category.dataDimensionType,
            dataDimension: category.dataDimension,
            $categoryOptions,
        };
    });
}

export function getRvcCode(parts: Array<string | undefined>): string {
    const code = _(parts)
        .compact()
        .map(part => part.replace(/\s*/g, "").replace(/^RVC_/, "").toUpperCase())
        .join("_");
    return "RVC_" + code;
}

export function getDashboardCode(config: MetadataConfig, dataSetId: string): string {
    return config.dataSetDashboardCodePrefix + "_" + dataSetId;
}

export function getByIndex<T, K extends keyof T>(objects: T[], key: K, value: T[K]): T {
    return _(objects)
        .keyBy(key)
        .getOrFail(value as any) as T;
}

function getFromRefs<T>(refs: Ref[], objects: T[]): T[] {
    const objectsById = _.keyBy(objects, "id");
    return refs.map(ref => _(objectsById).getOrFail(ref.id));
}

type Antigen = MetadataConfig["antigens"][number];

function getConfigDataElementsDisaggregation(
    antigens: MetadataConfig["antigens"],
    dataElementGroups: DataElementGroup[],
    dataElements: DataElement[],
    categoryCombos: CategoryCombo[],
    categories: Category[]
): MetadataConfig["dataElementsDisaggregation"] {
    const groupsByCode = _.keyBy(dataElementGroups, getCode);
    const catCombosByCode = _.keyBy(categoryCombos, getCode);
    const dataElementsForAntigens = getFromRefs(
        _(groupsByCode).getOrFail(baseConfig.dataElementGroupCodeForAntigens).dataElements,
        dataElements
    );

    return dataElementsForAntigens.map(
        (dataElement): MetadataConfig["dataElementsDisaggregation"][0] => {
            const getCategories = (
                typeString: string,
                options: { antigen?: Antigen } = {}
            ): Category[] | undefined => {
                const { antigen } = options;
                const code = getRvcCode([
                    "RVC_DE",
                    dataElement.code,
                    antigen ? antigen.code.replace(/ANTIGEN_/, "") : undefined,
                    typeString,
                ]);
                const categoryCombo = catCombosByCode[code];
                if (!categoryCombo) return undefined;

                const categoryRefs = categoryCombo ? categoryCombo.categories : [];
                const objectsById = _.keyBy(categories, getId);
                return categoryRefs.map(ref => _(objectsById).getOrFail(ref.id));
            };

            const requiredCategoriesDefault = getCategories("REQUIRED");
            const optionalCategoriesDefault = getCategories("OPTIONAL");

            const categoriesByAntigen = _(antigens)
                .map(antigen => {
                    const requiredCategories = _(
                        getCategories("REQUIRED", { antigen }) || requiredCategoriesDefault
                    )
                        .map(category => ({ code: category.code, optional: false }))
                        .value();

                    const optionalCategories = _(
                        getCategories("OPTIONAL", { antigen }) || optionalCategoriesDefault
                    )
                        .map(category => ({ code: category.code, optional: true }))
                        .value();

                    const categories = _.concat(requiredCategories, optionalCategories);

                    return [antigen.code, categories] as [typeof antigen.code, typeof categories];
                })
                .fromPairs()
                .value();

            return {
                id: dataElement.id,
                name: dataElement.displayName,
                code: dataElement.code,
                categories: categoriesByAntigen,
            };
        }
    );
}

function getAntigens(
    dataElementGroups: DataElementGroup[],
    dataElements: DataElement[],
    categories: Category[],
    categoryOptionGroups: CategoryOptionGroup[]
): MetadataConfig["antigens"] {
    const categoriesByCode = _.keyBy(categories, "code");
    const categoryOptions = _(categoriesByCode).getOrFail(
        baseConfig.categoryCodeForAntigens
    ).categoryOptions;
    const dataElementGroupsByCode = _.keyBy(dataElementGroups, "code");
    const categoryOptionGroupsByCode = _.keyBy(categoryOptionGroups, "code");

    const antigenIdsSelectable = new Set(
        _(categoryOptionGroupsByCode)
            .getOrFail(baseConfig.categoryOptionGroupOfAntigensWithSelectableType)
            .categoryOptions.map(co => co.id)
    );

    const antigensMetadata = categoryOptions.map(
        (categoryOption): MetadataConfig["antigens"][0] => {
            const getDataElements = (typeString: string) => {
                const code = getRvcCode([categoryOption.code, typeString]);
                const dataElementsForType = getFromRefs(
                    _(dataElementGroupsByCode).getOrFail(code).dataElements,
                    dataElements
                );
                // formName: Name - INDEX
                return dataElementsForType.map(de => ({
                    id: de.id,
                    code: de.code,
                    optional: typeString === "OPTIONAL",
                    order: parseInt(de.formName.split(" - ")[1] || "0"),
                }));
            };

            const dataElementsForAntigens = _.concat(
                getDataElements("REQUIRED"),
                getDataElements("OPTIONAL")
            );

            const dataElementSorted = _.orderBy(dataElementsForAntigens, "order");

            const mainAgeGroups = _(categoryOptionGroupsByCode).getOrFail(
                getRvcCode([categoryOption.code, "AGE_GROUP"])
            ).categoryOptions;

            const { categoryComboCodeForAgeGroup } = baseConfig;
            const sortConfig = { categoryComboCodeForAgeGroup, categories };

            const ageGroups = sortAgeGroups(sortConfig, mainAgeGroups).map(mainAgeGroup => {
                const codePrefix = getRvcCode([
                    categoryOption.code,
                    "AGE_GROUP",
                    mainAgeGroup.displayName,
                ]);
                const disaggregatedAgeGroups = _(categoryOptionGroups)
                    .filter(cog => cog.code.startsWith(codePrefix))
                    .sortBy(cog => cog.code)
                    .map(cog => sortAgeGroups(sortConfig, cog.categoryOptions))
                    .value();
                return [[mainAgeGroup], ...disaggregatedAgeGroups];
            });

            const dosesIds = _(categoryOptionGroupsByCode)
                .getOrFail(getRvcCode([categoryOption.code, "DOSES"]))
                .categoryOptions.map(co => co.id);
            const allDoses = _(categoriesByCode).getOrFail(
                baseConfig.categoryCodeForDoses
            ).categoryOptions;
            const doses = _(allDoses)
                .map(co =>
                    _(dosesIds).includes(co.id)
                        ? {
                              id: co.id,
                              code: co.code,
                              name: co.displayName,
                              displayName: co.displayName,
                          }
                        : null
                )
                .compact()
                .value();

            return {
                id: categoryOption.id,
                name: categoryOption.displayName,
                displayName: categoryOption.displayName,
                code: categoryOption.code,
                dataElements: dataElementSorted,
                ageGroups: ageGroups,
                doses: doses,
                isTypeSelectable: antigenIdsSelectable.has(categoryOption.id),
            };
        }
    );

    return antigensMetadata;
}

function getPopulationMetadata(
    dataElements: DataElement[],
    dataElementGroups: DataElementGroup[],
    categories: Category[]
): MetadataConfig["population"] {
    const dataElementsByCode = _(dataElements).keyBy(de => de.code);

    const totalPopulationDataElement = dataElementsByCode.getOrFail(
        baseConfig.dataElementCodeForTotalPopulation
    );
    const ageDistributionDataElement = dataElementsByCode.getOrFail(
        baseConfig.dataElementCodeForAgeDistribution
    );
    const populationByAgeDataElement = dataElementsByCode.getOrFail(
        baseConfig.dataElementCodeForPopulationByAge
    );

    const ageGroupCategory = _(categories)
        .keyBy("code")
        .getOrFail(baseConfig.categoryCodeForAgeGroup);

    const populationGroup = _(dataElementGroups)
        .keyBy("code")
        .getOrFail(baseConfig.dataElementGroupCodeForPopulation);

    return {
        totalPopulationDataElement: totalPopulationDataElement,
        ageDistributionDataElement: ageDistributionDataElement,
        populationByAgeDataElement: populationByAgeDataElement,
        ageGroupCategory,
        dataElementGroup: populationGroup,
    };
}

function getAttributes(attributes: Attribute[]) {
    const attributesByCode = _(attributes).keyBy(attribute => attribute.code);
    const attributesByName = _(attributes).keyBy(attribute => attribute.displayName);

    return {
        app: attributesByCode.getOrFail(baseConfig.attributeCodeForApp),
        hideInTallySheet: attributesByName.getOrFail(baseConfig.attributeNameForHideInTallySheet),
        dataInputPeriods: attributesByCode.getOrFail(baseConfig.attributeCodeForDataInputPeriods),
    };
}

function getDefaults(metadata: RawMetadataConfig): MetadataConfig["defaults"] {
    return {
        categoryOptionCombo: _(metadata.categoryOptionCombos)
            .keyBy("displayName")
            .getOrFail("default"),
    };
}

interface RawMetadataConfig {
    attributes: Attribute[];
    categories: Category[];
    categoryCombos: CategoryCombo[];
    categoryOptionCombos: CategoryOptionCombo[];
    categoryOptionGroups: CategoryOptionGroup[];
    dataElementGroups: DataElementGroup[];
    dataElements: DataElement[];
    dataSets: DataSet[];
    indicators: Indicator[];
    organisationUnitLevels: OrganisationUnitLevel[];
    userRoles: NamedObject[];
    legendSets: Ref[];
}

export async function getMetadataConfig(db: DbD2): Promise<MetadataConfig> {
    const userRoleNames = _(baseConfig.userRoleNames as _.Dictionary<string[]>)
        .values()
        .flatten()
        .value();

    const namedObjectFields = { id: true, name: true };
    const userRolesFilter = "name:in:[" + userRoleNames.join(",") + "]";
    const codeFilter = "code:startsWith:RVC_";
    const modelParams = { filters: [codeFilter] };

    const metadataParams = {
        attributes: {},
        categories: modelParams,
        categoryCombos: modelParams,
        categoryOptionGroups: modelParams,
        categoryOptionCombos: { filters: ["name:eq:default"] },
        dataElementGroups: modelParams,
        dataElements: modelParams,
        indicators: { fields: { id: true, code: true }, filters: [codeFilter] },
        dataSets: {
            fields: { id: true, name: true, code: true },
            filters: [`code:in:[${baseConfig.dataSetExtraCodes.join(",")}]`],
        },
        legendSets: { fields: { id: true, code: true }, filters: [codeFilter] },
        organisationUnitLevels: {},
        userRoles: { fields: namedObjectFields, filters: [userRolesFilter] },
    };

    const metadata = await db.getMetadata<RawMetadataConfig>(metadataParams);

    const antigens = getAntigens(
        metadata.dataElementGroups,
        metadata.dataElements,
        metadata.categories,
        metadata.categoryOptionGroups
    );
    const metadataConfig: MetadataConfig = {
        ...baseConfig,
        currentUser: await db.getCurrentUser(),
        attributes: getAttributes(metadata.attributes),
        organisationUnitLevels: metadata.organisationUnitLevels,
        categories: metadata.categories,
        categoriesDisaggregation: getCategoriesDisaggregation(metadata.categories),
        categoryOptions: _(metadata.categories)
            .flatMap(category => category.categoryOptions)
            .value(),
        categoryCombos: metadata.categoryCombos,
        dataElements: metadata.dataElements,
        dataElementsDisaggregation: getConfigDataElementsDisaggregation(
            antigens,
            metadata.dataElementGroups,
            metadata.dataElements,
            metadata.categoryCombos,
            metadata.categories
        ),
        defaults: getDefaults(metadata),
        antigens: antigens,
        population: getPopulationMetadata(
            metadata.dataElements,
            metadata.dataElementGroups,
            metadata.categories
        ),
        userRoles: metadata.userRoles,
        legendSets: metadata.legendSets,
        indicators: metadata.indicators,
        dataSets: {
            extraActivities: metadata.dataSets.filter(dataSet =>
                _(baseConfig.dataSetExtraCodes).includes(dataSet.code)
            ),
        },
    };

    return metadataConfig;
}

type AntigenCode = string;
