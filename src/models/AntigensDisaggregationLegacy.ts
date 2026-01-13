import { Category, CategoryOption, DataElement, getCode, Maybe, Ref } from "./db.types";
import _ from "lodash";
import { MetadataConfig, getRvcCode, baseConfig, AntigenConfig, Dose } from "./config";
import { Antigen } from "./campaign";
import "../utils/lodash-mixins";
import DbD2 from "./db-d2";
import { Struct } from "./Struct";
import i18n from "../locales";
import { assert } from "../utils/assert";
import { categoriesInDataElement } from "./D2CampaignMetadata";

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

            options: Array<{
                indexSelected: number;
                values: Array<Array<{ option: CategoryOption; selected: boolean }>>;
            }>;
        }>;
    }>;
}

type Code = string;

export class AntigenDisaggregationLegacy extends Struct<AntigenDisaggregationData>() {
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

        if (!selected /*|| selectedList.length !== 1*/) {
            return undefined;
        } else {
            return selected.option.code === baseConfig.categoryOptionCodeReactive
                ? "reactive"
                : "preventive";
        }
    }

    updateCampaignType(type: CampaignType): AntigenDisaggregationLegacy {
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
    dataElements: Ref[];
    dataSet: { id: string };
    sortOrder: number;
    greyedFields: Array<GreyedField>;
}

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

export type AntigenDisaggregationDataElement = AntigenDisaggregationLegacy["dataElements"][0];

export type AntigenDisaggregationCategoriesData =
    AntigenDisaggregationLegacy["dataElements"][0]["categories"];

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
    disaggregation: { [code: string]: AntigenDisaggregationLegacy };
};

export class AntigensDisaggregationLegacy {
    constructor(private config: MetadataConfig, public data: AntigensDisaggregationData) {}

    static build(
        config: MetadataConfig,
        antigens: Antigen[],
        sections: SectionForDisaggregation[]
    ): AntigensDisaggregationLegacy {
        const antigensByCode = _.keyBy(config.antigens, getCode);
        const disaggregation = _(sections)
            .sortBy(section => section.sortOrder)
            .map(section => {
                const antigen = antigensByCode[section.name];
                if (antigen) {
                    const disaggregationForAntigen = AntigensDisaggregationLegacy.buildForAntigen(
                        config,
                        antigen.code,
                        section
                    );
                    return [antigen.code, disaggregationForAntigen];
                } else {
                    return null;
                }
            })
            .compact()
            .fromPairs()
            .value();

        return new AntigensDisaggregationLegacy(config, { antigens, disaggregation });
    }

    public setAntigens(antigens: Antigen[]): AntigensDisaggregationLegacy {
        const disaggregationByCode = _.keyBy(this.data.disaggregation, getCode);
        const disaggregationUpdated = _(antigens)
            .keyBy(getCode)
            .mapValues(
                antigen =>
                    disaggregationByCode[antigen.code] ||
                    AntigensDisaggregationLegacy.buildForAntigen(
                        this.config,
                        antigen.code,
                        undefined
                    )
            )
            .value();
        const dataUpdated = { antigens, disaggregation: disaggregationUpdated };
        return new AntigensDisaggregationLegacy(this.config, dataUpdated);
    }

    public forAntigen(antigen: Antigen): AntigenDisaggregationLegacy | undefined {
        return this.data.disaggregation[antigen.code];
    }

    public set(path: (number | string)[], value: any): AntigensDisaggregationLegacy {
        const dataUpdated = fp.set(["disaggregation", ...path], value, this.data);
        return new AntigensDisaggregationLegacy(this.config, dataUpdated);
    }

    public setCampaignType(antigen: Antigen, type: CampaignType): AntigensDisaggregationLegacy {
        const dataUpdated: AntigensDisaggregationData = {
            ...this.data,
            disaggregation: _.mapValues(this.data.disaggregation, (disaggregation, antigenCode) => {
                return antigenCode !== antigen.code
                    ? disaggregation
                    : disaggregation.updateCampaignType(type);
            }),
        };

        return new AntigensDisaggregationLegacy(this.config, dataUpdated);
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
        dataElementConfig: MetadataConfig["dataElementsDisaggregation"][0],
        antigenConfig: MetadataConfig["antigens"][0],
        section: Maybe<SectionForDisaggregation>
    ): AntigenDisaggregationCategoriesData {
        const categoriesByCode = _.keyBy(config.categories, getCode);

        const categoriesForAntigen = dataElementConfig.categories[antigenConfig.code];
        if (!categoriesForAntigen)
            throw new Error(`No categories defined for antigen: ${antigenConfig.code}`);

        return categoriesForAntigen.flatMap((categoryRef): CategoryData[] => {
            const category = _(categoriesByCode).getOrFail(categoryRef.code);
            const isDosesCategory = category.code === config.categoryCodeForDoses;
            const isAntigensCategory = category.code === config.categoryCodeForAntigens;
            const isCampaignTypeCategory = category.code === config.categoryCodeForCampaignType;
            const {
                $categoryOptions,
                name: categoryName,
                ...categoryAttributes
            } = _(config.categoriesDisaggregation).keyBy(getCode).getOrFail(categoryRef.code);

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
                const categoryOptionsEnabled = _(section ? section.greyedFields : [])
                    .flatMap(greyedField =>
                        getGreyedFieldCategoryOptions(group, greyedField, category)
                    )
                    .uniq()
                    .value();

                const wasCategorySelected = !_(categoryOptionsEnabled).isEmpty();

                const options = getCategoryOptions(
                    antigenConfig,
                    category,
                    group.categoryOptions,
                    categoryOptionsEnabled
                );

                const optional = group.optional ?? categoryRef.optional;
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
        });
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
        antigenDisaggregation: AntigenDisaggregationLegacy
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
        section: Maybe<SectionForDisaggregation>
    ): AntigenDisaggregationLegacy {
        const antigenConfig = _(config.antigens).keyBy(getCode).get(antigenCode);

        if (!antigenConfig) throw new Error(`No configuration for antigen: ${antigenCode}`);

        const dataElementsProcessed = antigenConfig.dataElements.map(dataElementRef => {
            const dataElementConfig = _(config.dataElementsDisaggregation)
                .keyBy(getCode)
                .getOrFail(dataElementRef.code);

            const categoriesDisaggregation = AntigensDisaggregationLegacy.getCategories(
                config,
                dataElementConfig,
                antigenConfig,
                section
            );
            const selected =
                !dataElementRef.optional || !section
                    ? true
                    : section.dataElements.some(de => de.id === dataElementRef.id);

            return {
                id: dataElementConfig.id,
                name: dataElementConfig.name,
                code: dataElementConfig.code,
                categories: categoriesDisaggregation,
                optional: dataElementRef.optional,
                selected,
            };
        });

        const disaggregation = AntigenDisaggregationLegacy.create({
            id: antigenConfig.id,
            name: antigenConfig.name,
            code: antigenConfig.code,
            dataElements: dataElementsProcessed,
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

function getGreyedFieldCategoryOptions(
    group: Group,
    greyedField: GreyedField,
    category: Category
): GreyedFieldCategoryOption[] {
    const { categoryOptions } = greyedField.categoryOptionCombo;

    // As the Doses category is split, we have to perform an extra check: the greyed field
    // should belong to the dose category option we are processing.
    const matchesCategoryOption =
        !group.doseId || categoryOptions.some(categoryOption => categoryOption.id === group.doseId);

    if (matchesCategoryOption) {
        return greyedField.categoryOptionCombo.categoryOptions.filter(categoryOption => {
            return categoryOption.categories.some(category_ => category_.id === category.id);
        });
    } else {
        return [];
    }
}

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

function getCategoryOptions(
    antigenConfig: MetadataConfig["antigens"][0],
    category: Category,
    groups: CategoryOption[][][],
    categoryOptionsEnabled: Ref[]
) {
    const categoryOverride = antigenConfig.categoriesOverride[category.code];
    const wasCategorySelected = !_(categoryOptionsEnabled).isEmpty();

    return groups.map(optionGroup => {
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
