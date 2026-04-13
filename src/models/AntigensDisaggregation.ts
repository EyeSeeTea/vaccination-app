import { Category, CategoryOption, DataElement, getCode, Maybe, Ref } from "./db.types";
import _ from "lodash";
import "../utils/lodash-mixins";
import {
    MetadataConfig,
    getRvcCode,
    baseConfig,
    AntigenConfig,
    Dose,
    DataElementDisaggregation,
    CategoryInfo,
} from "./config";
import { Antigen } from "./campaign";
import "../utils/lodash-mixins";
import DbD2 from "./db-d2";
import { Struct } from "./Struct";
import i18n from "../locales";
import { assert, throw_ } from "../utils/assert";
import {
    categoriesInDataElement,
    dataElementsInfo,
    DisaggregationType,
    getAntigenCode,
    getDataElementDisaggregations,
    DataElementInfo,
} from "./D2CampaignMetadata";
import { getAntigenCodeFromSection } from "../data/CampaignD2Get";
import { zipShortest } from "../utils/lodash-mixins";

const fp = require("lodash/fp");

export type CampaignType = "preventive" | "reactive";

const defaultCampaignType: CampaignType = "preventive";

interface AntigenDisaggregationData {
    name: string;
    code: string;
    id: string;
    doses: Array<{ id: string; name: string }>;
    isTypeSelectable: boolean;
    dataElements: Array<{
        name: string;
        code: string;
        id: string;
        selected: boolean;
        optional: boolean;

        categories: Array<{
            name: string;
            code: string;
            optional: boolean;
            selected: boolean;
            visible: boolean;
            restrictForOptionIds: string[] | undefined;

            options: Array<IndexedOption>;
        }>;
    }>;
}

type IndexedOption = {
    indexSelected: number;
    values: Array<Array<{ option: CategoryOption; selected: boolean }>>;
};

type Code = string;

export class AntigenDisaggregation extends Struct<AntigenDisaggregationData>() {
    codeMapping: Record<CampaignType, Code> = {
        preventive: baseConfig.categoryOptionCodePreventive,
        reactive: baseConfig.categoryOptionCodeReactive,
    };

    get type(): Maybe<CampaignType> {
        const selectedList = _(this.dataElements)
            .filter(de => de.code === baseConfig.dataElementDosesAdministeredCode)
            .flatMap(de => de.categories.filter(category => category.code === "RVC_TYPE"))
            .flatMap(category => category.options)
            .flatMap(options => options.values)
            .flatten()
            .filter(value => value.selected)
            .value();

        const selected = selectedList[0];

        if (!selected || selectedList.length !== 1) {
            return undefined;
        } else {
            return selected.option.code === baseConfig.categoryOptionCodeReactive
                ? "reactive"
                : "preventive";
        }
    }

    updateCampaignType(type: CampaignType): AntigenDisaggregation {
        const codeToSet = this.codeMapping[type];

        const dataElementsUpdated = this.dataElements.map(dataElement => ({
            ...dataElement,
            categories: dataElement.categories.map(category => {
                if (category.code !== baseConfig.categoryCodeForCampaignType) return category;

                return {
                    ...category,
                    options: category.options.map(optionGroup => ({
                        ...optionGroup,
                        values: optionGroup.values.map(values =>
                            values.map(value => ({
                                ...value,
                                selected: value.option.code === codeToSet,
                            }))
                        ),
                    })),
                };
            }),
        }));

        return this._update({ dataElements: dataElementsUpdated });
    }
}

export interface SectionForDisaggregation {
    name: string;
    code: string;
    dataElements: Array<{ id: string; code: string }>;
    dataSet: { id: string };
    sortOrder: number;
    greyedFields: Array<GreyedField>;
}

type DataElementId = string;

export type CategoryCombosMapping = Record<DataElementId, CategoryCombo>;

type CategoryCombo = {
    id: string;
    name: string;
    categories: Ref[];
    categoryOptionCombos: { id: string; categoryOptions: Ref[] }[];
};

type GreyedField = {
    categoryOptionCombo: {
        id: string;
        categoryOptions: GreyedFieldCategoryOption[];
    };
    dataElement: Ref;
};

type GreyedFieldCategoryOption = {
    id: string;
    name: string;
    displayName: string;
    categories: Ref[];
};

export type AntigenDisaggregationDataElement = AntigenDisaggregation["dataElements"][0];

export type AntigenDisaggregationCategoriesData =
    AntigenDisaggregation["dataElements"][0]["categories"];

type CategoryData = AntigenDisaggregationCategoriesData[0];

export type AntigenDisaggregationOptionGroup = AntigenDisaggregationCategoriesData[0]["options"][0];

export type AntigenDisaggregationEnabled = Array<{
    type: Maybe<CampaignType>;
    antigen: Antigen;
    ageGroups: Array<CategoryOption>;
    dataElements: AntigenDisaggregationEnabledDataElement[];
}>;

export type AntigenDisaggregationEnabledDataElement = {
    id: string;
    name: string;
    code: string;
    categories: Array<{
        code: string;
        categoryOptions: CategoryOption[];
        onlyForCategoryOptionIds: string[] | undefined;
    }>;
};

export type AntigenDisaggregationEnabledDataElementCategory =
    AntigenDisaggregationEnabledDataElement["categories"][0];

export type CocMetadata = {
    getByOptions(categoryOptions: Ref[]): Maybe<string>;
    getByCategoryCombo(categoryCombo: Ref): string[];
};

type AntigensDisaggregationData = {
    antigens: Antigen[];
    disaggregation: { [code: string]: AntigenDisaggregation };
};

export class AntigensDisaggregation {
    constructor(private config: MetadataConfig, public data: AntigensDisaggregationData) {}

    static build(
        config: MetadataConfig,
        antigens: Antigen[],
        categoryCombosMapping: CategoryCombosMapping,
        sections: SectionForDisaggregation[]
    ): AntigensDisaggregation {
        const antigensByCode = _.keyBy(config.antigens, antigen => getAntigenCode(antigen.code));
        const generalSection = sections.find(section => !section.code);

        const disaggregation = _(sections)
            .sortBy(section => section.sortOrder)
            .map(section => {
                const antigenCode = getAntigenCodeFromSection(section);
                const antigen = antigensByCode[antigenCode];

                // Add data elements from the common general section to the current antigen section
                const sectionWithGeneralDataElements: SectionForDisaggregation = {
                    ...section,
                    dataElements: _.concat(
                        section.dataElements,
                        generalSection ? generalSection.dataElements : []
                    ),
                };

                if (antigen) {
                    const disaggregationForAntigen = AntigensDisaggregation.buildForAntigen(
                        config,
                        antigen.code,
                        categoryCombosMapping,
                        sectionWithGeneralDataElements
                    );
                    return [antigen.code, disaggregationForAntigen];
                } else {
                    return null;
                }
            })
            .compact()
            .fromPairs()
            .value();

        return new AntigensDisaggregation(config, { antigens, disaggregation });
    }

    public setAntigens(antigens: Antigen[]): AntigensDisaggregation {
        const disaggregationByCode = _.keyBy(this.data.disaggregation, getCode);
        const disaggregationUpdated = _(antigens)
            .keyBy(getCode)
            .mapValues(
                antigen =>
                    disaggregationByCode[antigen.code] ||
                    AntigensDisaggregation.buildForAntigen(this.config, antigen.code, {}, undefined)
            )
            .value();
        const dataUpdated = { antigens, disaggregation: disaggregationUpdated };
        return new AntigensDisaggregation(this.config, dataUpdated);
    }

    public forAntigen(antigen: Antigen): AntigenDisaggregation | undefined {
        return this.data.disaggregation[antigen.code];
    }

    public set(path: (number | string)[], value: any): AntigensDisaggregation {
        const dataUpdated = fp.set(["disaggregation", ...path], value, this.data);
        return new AntigensDisaggregation(this.config, dataUpdated);
    }

    public setCampaignType(antigen: Antigen, type: CampaignType): AntigensDisaggregation {
        const dataUpdated: AntigensDisaggregationData = {
            ...this.data,
            disaggregation: _.mapValues(this.data.disaggregation, (disaggregation, antigenCode) => {
                return antigenCode !== antigen.code
                    ? disaggregation
                    : disaggregation.updateCampaignType(type);
            }),
        };

        return new AntigensDisaggregation(this.config, dataUpdated);
    }

    public validate(): Array<{ key: string; namespace: _.Dictionary<string> }> {
        const enabled = this.getEnabled();

        const errors1 = _(enabled)
            .flatMap(antigen => antigen.dataElements)
            .flatMap(dataElement => dataElement.categories)
            .map(category =>
                _(category.categoryOptions).isEmpty()
                    ? { key: "select_at_least_one_option_for_category", namespace: {} }
                    : null
            )
            .compact()
            .value();

        const errors2 = _(enabled)
            .filter(antigen => !antigen.type)
            .map(antigen =>
                antigen.type
                    ? null
                    : {
                          key: "antigen_has_no_selected_type",
                          namespace: { antigen: antigen.antigen.displayName },
                      }
            )
            .compact()
            .value();

        return _.concat(errors1, errors2);
    }

    static getCategories(
        config: MetadataConfig,
        dataElementConfig: MetadataConfig["dataElementsDisaggregation"][0] & { optional: boolean },
        antigenConfig: MetadataConfig["antigens"][0],
        categoryCombosMapping: CategoryCombosMapping,
        section: Maybe<SectionForDisaggregation>
    ): {
        categoriesDisaggregation: AntigenDisaggregationCategoriesData;
        dataElementSelected: boolean;
    } {
        const dataElementInfo = dataElementsInfo.find(
            de => de.modelCode === dataElementConfig.code
        );

        const d2DataElements =
            dataElementInfo && section
                ? section.dataElements.filter(de => de.code.startsWith(dataElementInfo.code))
                : [dataElementConfig];

        const categoriesDisaggregation = new GetCategoriesDisaggregation({
            config,
            antigenConfig,
            dataElementConfig,
            categoryCombosMapping,
            section,
            d2DataElements,
        }).execute();

        const dataElementSelected =
            !dataElementConfig.optional || !section
                ? true
                : section.dataElements.some(de => d2DataElements.some(d2de => d2de.id === de.id));

        return {
            categoriesDisaggregation: categoriesDisaggregation,
            dataElementSelected: dataElementSelected,
        };
    }

    getEnabled(): AntigenDisaggregationEnabled {
        const antigenDisaggregations = _(this.data.antigens)
            .map(this.forAntigen.bind(this))
            .compact()
            .value();

        const enabled = antigenDisaggregations.map(
            (antigenDisaggregation): AntigenDisaggregationEnabled[0] => {
                const dataElements = _(antigenDisaggregation.dataElements)
                    .filter(dataElement => dataElement.selected)
                    .map(dataElement => {
                        const categories = _(dataElement.categories)
                            .filter(category => category.selected)
                            .map((category): AntigenDisaggregationEnabledDataElementCategory => {
                                const categoryOptions = this.getCategoryOptions(
                                    category,
                                    antigenDisaggregation
                                );

                                return {
                                    code: category.code,
                                    categoryOptions: categoryOptions,
                                    onlyForCategoryOptionIds: category.restrictForOptionIds,
                                };
                            })
                            .value();

                        return {
                            id: dataElement.id,
                            code: dataElement.code,
                            name: dataElement.name,
                            categories: categories,
                        };
                    })
                    .value();

                const ageGroups = _(dataElements)
                    .flatMap(dataElement => dataElement.categories)
                    .filter(category => category.code === this.config.categoryCodeForAgeGroup)
                    .flatMap(category => category.categoryOptions)
                    .uniqBy(ageGroup => ageGroup.id)
                    .value();

                return {
                    ageGroups: ageGroups,
                    type: antigenDisaggregation.type,
                    antigen: {
                        code: antigenDisaggregation.code,
                        name: antigenDisaggregation.name,
                        displayName: antigenDisaggregation.name,
                        id: antigenDisaggregation.id,
                        doses: antigenDisaggregation.doses,
                        isTypeSelectable: antigenDisaggregation.isTypeSelectable,
                    },
                    dataElements: dataElements,
                };
            }
        );

        return enabled;
    }

    private getCategoryOptions(
        category: CategoryData,
        antigenDisaggregation: AntigenDisaggregation
    ) {
        const isDoses = category.code === this.config.categoryCodeForDoses;

        const categoryOptionsList = _(category.options)
            .flatMap(({ values, indexSelected }) => values[indexSelected])
            .compact()
            // For the Doses category, we want all the category options (doses), even if they are
            // not selected, the selection will be done in the corresponding Age group category.
            .filter(categoryOption => isDoses || categoryOption.selected)
            .value();

        const isAntigen = category.code === this.config.categoryCodeForAntigens;

        const categoryOptions = categoryOptionsList.map(obj => obj.option);

        return isAntigen
            ? categoryOptions.filter(co => co.code === antigenDisaggregation.code)
            : categoryOptions;
    }

    static buildForAntigen(
        config: MetadataConfig,
        antigenCode: string,
        categoryCombosMapping: CategoryCombosMapping,
        section: Maybe<SectionForDisaggregation>
    ): AntigenDisaggregation {
        const antigenConfig = _(config.antigens).keyBy(getCode).get(antigenCode);

        if (!antigenConfig) throw new Error(`No configuration for antigen: ${antigenCode}`);

        const dataElementsDisaggregation = antigenConfig.dataElements.map(dataElement => {
            const dataElementConfig = _(config.dataElementsDisaggregation)
                .keyBy(getCode)
                .getOrFail(dataElement.code);

            const { categoriesDisaggregation, dataElementSelected } =
                AntigensDisaggregation.getCategories(
                    config,
                    { ...dataElementConfig, optional: dataElement.optional },
                    antigenConfig,
                    categoryCombosMapping,
                    section
                );

            return {
                id: dataElementConfig.id,
                name: dataElementConfig.name,
                code: dataElementConfig.code,
                categories: categoriesDisaggregation,
                optional: dataElement.optional,
                selected: dataElementSelected,
            };
        });

        const disaggregation = AntigenDisaggregation.create({
            id: antigenConfig.id,
            name: antigenConfig.name,
            code: antigenConfig.code,
            dataElements: dataElementsDisaggregation,
            doses: antigenConfig.doses,
            isTypeSelectable: antigenConfig.isTypeSelectable,
        });

        if (!disaggregation.isTypeSelectable && !disaggregation.type) {
            return disaggregation.updateCampaignType(defaultCampaignType);
        } else {
            return disaggregation;
        }
    }

    public async getCocMetadata(db: DbD2): Promise<CocMetadata> {
        const categoryComboCodes = _(this.getEnabled())
            .flatMap(disaggregation => disaggregation.dataElements)
            .filter(dataElement => !_(dataElement.categories).isEmpty())
            .map(dataElement =>
                getRvcCode(_.uniq(dataElement.categories.map(category => category.code)))
            )
            .uniq()
            .value();

        const categoryComboCodes2 = _(this.getEnabled())
            .flatMap(disaggregation => disaggregation.dataElements)
            .map(dataElement => {
                const categories = dataElement.categories.filter(
                    cat => !categoriesInDataElement.includes(cat.code)
                );
                if (_(categories).isEmpty()) return;
                return getRvcCode(_.uniq(categories.map(category => category.code)));
            })
            .compact()
            .uniq()
            .value();

        // Add age groups required by target population data values

        const allCategoryComboCodes = _.uniq([
            "default",
            ...categoryComboCodes,
            ...categoryComboCodes2,
            this.config.categoryCodeForAgeGroup,
            this.config.categoryComboCodeForAntigenDosesAgeGroup,
            this.config.categoryComboCodeForAntigenDosesAgeGroupType,
        ]);
        const categoryCombos = await db.getCocsByCategoryComboCode(allCategoryComboCodes);
        const categoryOptionCombos = categoryCombos.flatMap(cc => cc.categoryOptionCombos);

        const getKey = (categoryOptions: Ref[]) => {
            return _.sortBy(categoryOptions.map(co => co.id)).join(".");
        };
        const cocsByOptionsKey = _(categoryOptionCombos)
            .map(coc => [getKey(coc.categoryOptions), coc.id])
            .push(["", this.config.defaults.categoryOptionCombo.id])
            .fromPairs()
            .value();

        function getCocIdByCategoryOptions(categoryOptions: Ref[]): Maybe<string> {
            const key = getKey(categoryOptions);
            const value = cocsByOptionsKey[key];
            if (!value) {
                console.warn(
                    `Coc not found for options: ${categoryOptions.map(co => co.id).join(", ")}`
                );
            }
            return value;
        }

        function getByCategoryCombo(categoryCombo: Ref): string[] {
            const categoryCombo2 = assert(
                _(categoryCombos).find(cc => cc.id === categoryCombo.id),
                `Category combo not found: ${categoryCombo.id}`
            );

            return categoryCombo2.categoryOptionCombos.map(coc => coc.id);
        }

        return {
            getByOptions: getCocIdByCategoryOptions,
            getByCategoryCombo: getByCategoryCombo,
        };
    }
}

type Group = {
    categoryOptions: CategoryOption[][][];
    optional?: boolean;
    name?: string;
    // Currently, this is used only to model age groups by doses
    onlyForCategoryOptionIds?: string[];
    doseId?: string;
};

function getGroupsForAgeGroups(antigenConfig: AntigenConfig): Group[] {
    return _(antigenConfig.doses)
        .groupBy(dose => JSON.stringify(dose.ageGroups))
        .values()
        .map((doses): Group => {
            const dose = doses[0];
            if (!dose) throw new Error();
            const dosesIndexes = doses.map(dose => dose.name.match(/\d+/)?.[0]).join("/");

            return {
                name: i18n.t("Dose {{-indexes}}", { indexes: dosesIndexes }),
                categoryOptions: dose.ageGroups.options,
                optional: dose.ageGroups.optional,
                onlyForCategoryOptionIds: doses.map(dose => dose.id),
                doseId: dose.id,
            };
        })
        .value();
}

export function getDataElements(
    config: MetadataConfig,
    disaggregationData: AntigenDisaggregationEnabled
): DataElement[] {
    const dataElementsByCode = _(config.dataElements).keyBy(getCode);
    return _(disaggregationData)
        .flatMap(dd => dd.dataElements.map(de => de.code))
        .uniq()
        .map(deCode => dataElementsByCode.getOrFail(deCode))
        .value();
}

export function isAgeGroupIncluded(
    ageGroup: Ref,
    disaggregation: AntigenDisaggregationEnabled[0],
    dose: Dose
): boolean {
    const dosesAdministeredDataElement = disaggregation.dataElements.find(dataElement => {
        return dataElement.code === baseConfig.dataElementDosesAdministeredCode;
    });

    if (!dosesAdministeredDataElement) {
        console.error(`Data element not found: ${baseConfig.dataElementDosesAdministeredCode}`);
        return false;
    }

    const ageGroupIds = dosesAdministeredDataElement.categories
        .filter(category => category.code === baseConfig.categoryCodeForAgeGroup)
        .filter(ageGroupCategory => {
            return (
                !ageGroupCategory.onlyForCategoryOptionIds ||
                ageGroupCategory.onlyForCategoryOptionIds.includes(dose.id)
            );
        })
        .flatMap(item => item.categoryOptions)
        .map(categoryOption => categoryOption.id);

    return ageGroupIds.includes(ageGroup.id);
}

class GetCategoriesDisaggregation {
    categoriesByCode: Record<string, Category>;
    dataElementInfo: Maybe<DataElementInfo>;

    constructor(
        private options: {
            dataElementConfig: DataElementDisaggregation;
            d2DataElements: Array<{ id: string; code: string }>;
            section: Maybe<SectionForDisaggregation>;
            categoryCombosMapping: CategoryCombosMapping;
            config: MetadataConfig;
            antigenConfig: AntigenConfig;
        }
    ) {
        this.categoriesByCode = _.keyBy(options.config.categories, category => category.code);

        this.dataElementInfo = dataElementsInfo.find(
            de => de.modelCode === options.dataElementConfig.code
        );
    }

    execute() {
        const { dataElementConfig, antigenConfig } = this.options;

        const categoriesForAntigen =
            dataElementConfig.categories[antigenConfig.code] ||
            throw_(new Error(`No categories defined for antigen: ${antigenConfig.code}`));

        return categoriesForAntigen.flatMap(category => this.getCategoryDisaggregation(category));
    }

    private getCategoryDisaggregation(categoryInfo: CategoryInfo): CategoryData[] {
        const { d2DataElements, section, categoryCombosMapping, config, antigenConfig } =
            this.options;

        const d2DataElement = d2DataElements[0];

        const categoryCombo =
            section && d2DataElement ? assert(categoryCombosMapping[d2DataElement.id]) : undefined;

        const category = _(this.categoriesByCode).getOrFail(categoryInfo.code);
        const isDosesCategory = category.code === config.categoryCodeForDoses;
        const isAntigensCategory = category.code === config.categoryCodeForAntigens;
        const isCampaignTypeCategory = category.code === config.categoryCodeForCampaignType;
        const {
            $categoryOptions,
            name: categoryName,
            ...categoryAttributes
        } = _(config.categoriesDisaggregation).keyBy(getCode).getOrFail(categoryInfo.code);

        let groups: Group[];

        if ($categoryOptions.kind === "fromAgeGroups") {
            groups = getGroupsForAgeGroups(antigenConfig);
        } else if ($categoryOptions.kind === "fromAntigens") {
            groups = [{ categoryOptions: config.antigens.map(antigen => [[antigen]]) }];
        } else if ($categoryOptions.kind === "fromDoses") {
            groups = [{ categoryOptions: antigenConfig.doses.map(dose => [[dose]]) }];
        } else {
            groups = [{ categoryOptions: $categoryOptions.values.map(option => [[option]]) }];
        }

        // Create a category for each group of category options
        // Example: Malaria will have separate dose categories by age groups
        return groups.map((group): CategoryData => {
            const categoryOptionsEnabled = this.getCategoryOptionsEnabled({
                categoryCombo: categoryCombo,
                group: group,
                categoryInfo: categoryInfo,
            });

            const options = this.getIndexedOptions(
                category,
                group.categoryOptions,
                categoryOptionsEnabled
            );

            const optional = group.optional ?? categoryInfo.optional;
            const wasCategorySelected = !_(categoryOptionsEnabled).isEmpty();
            const selected = wasCategorySelected ? true : !optional;

            // Example: _23.6 Displacement Status
            const cleanCategoryName = categoryName
                .replace(/^[_\d.\s]+/, "")
                .replace("RVC", "")
                .trim();

            return {
                ...categoryAttributes,
                name: cleanCategoryName + (group.name ? ` (${group.name})` : ""),
                optional: optional,
                selected: selected,
                options: options,
                visible: !(isDosesCategory || isAntigensCategory || isCampaignTypeCategory),
                restrictForOptionIds: group.onlyForCategoryOptionIds,
            };
        });
    }

    private getIndexedOptions(
        category: Category,
        groups: CategoryOption[][][],
        categoryOptionsEnabled: Ref[]
    ): IndexedOption[] {
        const { antigenConfig } = this.options;
        const categoryOverride = antigenConfig.categoriesOverride[category.code];
        const wasCategorySelected = !_(categoryOptionsEnabled).isEmpty();

        return groups.map((optionGroup): IndexedOption => {
            const index = wasCategorySelected
                ? _(optionGroup).findIndex(
                      options =>
                          !_(options)
                              .intersectionBy(categoryOptionsEnabled, co => co.id)
                              .isEmpty()
                  )
                : 0;

            const indexSelected = index >= 0 ? index : 0;

            const values = _(optionGroup)
                .map((options, optionGroupIndex) => {
                    const isOptionGroupSelected =
                        wasCategorySelected && indexSelected === optionGroupIndex;

                    const optionsFiltered = _(options)
                        .map(option => {
                            const optionIsNotInOverride =
                                categoryOverride &&
                                !_(categoryOverride.options).some(co => co.id === option.id);

                            if (optionIsNotInOverride) return null;

                            return {
                                option: option,
                                selected: isOptionGroupSelected
                                    ? _(categoryOptionsEnabled).some(co => co.id === option.id)
                                    : true,
                            };
                        })
                        .compact()
                        .value();

                    return optionsFiltered.length === 0 ? null : optionsFiltered;
                })
                .compact()
                .value();

            return { indexSelected: indexSelected, values: values };
        });
    }

    private getCategoryOptionsEnabled(options: {
        categoryCombo: CategoryCombo | undefined;
        group: Group;
        categoryInfo: CategoryInfo;
    }) {
        const { categoryCombo, group, categoryInfo } = options;
        const { section } = this.options;

        if (!(section && categoryCombo)) {
            return [];
        }

        const categoryOptionsGroupsDisabled = this.getCategoryOptionsGroupsDisabled(
            section,
            categoryCombo
        );

        const categories = _.compact([
            // Base disaggregations
            this.getCategory("antigen"),
            this.getCategory("dose"),
            this.getCategory("campaignType"),
            // Extra disaggregations for the category combo of the data element
            ...this.getCategoriesFromCategoryCombo(categoryCombo),
        ]);

        const categoryOptionProducts = _.cartesianProduct(
            categories.map(obj => _.uniq(obj.categoryOptions))
        );

        // Subtract all combinations from disabled (greyed out) to get the enabled combinations
        const combinationsEnabled = categoryOptionProducts.filter(product => {
            return !categoryOptionsGroupsDisabled.some(categoryOptionsGroupDisabled =>
                categoryOptionsGroupDisabled.every(categoryOptionDisabled =>
                    product.some(categoryOption => categoryOption.id === categoryOptionDisabled.id)
                )
            );
        });

        const categoryCodes = categories.map(category => category.code);

        return combinationsEnabled.flatMap(combination => {
            const { onlyForCategoryOptionIds } = group;

            const keepCombination =
                !onlyForCategoryOptionIds ||
                combination.some(categoryOption =>
                    onlyForCategoryOptionIds.includes(categoryOption.id)
                );

            if (!keepCombination) return [];

            return _.compact(
                zipShortest(categoryCodes, combination).map(([categoryCode, categoryOption]) =>
                    categoryCode === categoryInfo.code ? { id: categoryOption.id } : null
                )
            );
        });
    }

    private getCategoriesFromCategoryCombo(categoryCombo: CategoryCombo) {
        if (categoryCombo.name === "default") {
            return [];
        } else {
            return categoryCombo.categories.map(category_ => {
                return assert(this.options.config.categories.find(cat => cat.id === category_.id));
            });
        }
    }

    private getCategory(disaggregationType: DisaggregationType): Maybe<{
        code: string;
        categoryOptions: Ref[];
    }> {
        const { d2DataElements, config } = this.options;

        const codes = {
            antigen: baseConfig.categoryCodeForAntigens,
            dose: baseConfig.categoryCodeForDoses,
            campaignType: baseConfig.categoryCodeForCampaignType,
        };

        const categoryCode = codes[disaggregationType];

        if (!this.dataElementInfo?.disaggregations.includes(disaggregationType)) return;

        return {
            code: categoryCode,
            categoryOptions: _(d2DataElements)
                .map(dataElement => {
                    const disaggregations = getDataElementDisaggregations(dataElement, config);
                    return disaggregations[disaggregationType]?.categoryOption;
                })
                .compact()
                .value(),
        };
    }

    private getCategoryOptionsGroupsDisabled(
        section: SectionForDisaggregation,
        categoryCombo: CategoryCombo
    ): Ref[][] {
        const { d2DataElements, config } = this.options;

        return _(section.greyedFields)
            .filter(greyedField => d2DataElements.some(de => de.id === greyedField.dataElement.id))
            .map(greyedField => {
                const greyedCoc = assert(
                    categoryCombo.categoryOptionCombos.find(
                        coc => coc.id === greyedField.categoryOptionCombo.id
                    )
                );

                const d2DataElement = assert(
                    config.dataElements.find(de => de.id === greyedField.dataElement.id)
                );

                const dataElementDisaggregations = getDataElementDisaggregations(
                    d2DataElement,
                    config
                );

                const categoryOptionsDisabled = _.compact([
                    dataElementDisaggregations.antigen?.categoryOption,
                    dataElementDisaggregations.dose?.categoryOption,
                    dataElementDisaggregations.campaignType?.categoryOption,
                    ...(greyedCoc.categoryOptions || []),
                ]);

                return categoryOptionsDisabled;
            })
            .compact()
            .value();
    }
}
