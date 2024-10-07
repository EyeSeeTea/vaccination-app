import { Category, CategoryOption, DataElement, getCode, Maybe, Ref } from "./db.types";
import _ from "lodash";
import { MetadataConfig, getRvcCode, baseConfig } from "./config";
import { Antigen } from "./campaign";
import "../utils/lodash-mixins";
import DbD2 from "./db-d2";
import { Struct } from "./Struct";

const fp = require("lodash/fp");

export type CampaignType = "preventive" | "reactive";

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

            options: Array<{
                indexSelected: number;
                values: Array<Array<{ option: CategoryOption; selected: boolean }>>;
            }>;
        }>;
    }>;
}

type Code = string;

export class AntigenDisaggregation extends Struct<AntigenDisaggregationData>() {
    codeMapping: Record<CampaignType, Code> = {
        preventive: baseConfig.categoryOptionCodePreventive,
        reactive: baseConfig.categoryOptionCodeReactive,
    };

    get type(): CampaignType {
        const selected = _(this.dataElements)
            .filter(de => de.code === "RVC_DOSES_ADMINISTERED")
            .flatMap(de => de.categories.filter(category => category.code === "RVC_TYPE"))
            .flatMap(category => category.options)
            .flatMap(options => options.values)
            .flatten()
            .find(value => value.selected);

        const selectedCode = selected ? selected.option.code : undefined;
        return selectedCode === baseConfig.categoryOptionCodePreventive ? "preventive" : "reactive";
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
    dataElements: Ref[];
    dataSet: { id: string };
    sortOrder: number;
    greyedFields: Array<{
        categoryOptionCombo: {
            id: string;
            categoryOptions: Array<{
                id: string;
                name: string;
                displayName: string;
                categories: Ref[];
            }>;
        };
        dataElement: Ref;
    }>;
}

export type AntigenDisaggregationDataElement = AntigenDisaggregation["dataElements"][0];

export type AntigenDisaggregationCategoriesData =
    AntigenDisaggregation["dataElements"][0]["categories"];

export type AntigenDisaggregationOptionGroup = AntigenDisaggregationCategoriesData[0]["options"][0];

export type AntigenDisaggregationEnabled = Array<{
    type: CampaignType;
    antigen: Antigen;
    ageGroups: Array<CategoryOption>;
    dataElements: Array<{
        id: string;
        name: string;
        code: string;
        categories: Array<{ code: string; categoryOptions: CategoryOption[] }>;
    }>;
}>;

export type CocMetadata = {
    getByOptions(categoryOptions: Ref[]): Maybe<string>;
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
        sections: SectionForDisaggregation[]
    ): AntigensDisaggregation {
        const antigensByCode = _.keyBy(config.antigens, getCode);
        const disaggregation = _(sections)
            .sortBy(section => section.sortOrder)
            .map(section => {
                const antigen = antigensByCode[section.name];
                if (antigen) {
                    const disaggregationForAntigen = AntigensDisaggregation.buildForAntigen(
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

        return new AntigensDisaggregation(config, { antigens, disaggregation });
    }

    public setAntigens(antigens: Antigen[]): AntigensDisaggregation {
        const disaggregationByCode = _.keyBy(this.data.disaggregation, getCode);
        const disaggregationUpdated = _(antigens)
            .keyBy(getCode)
            .mapValues(
                antigen =>
                    disaggregationByCode[antigen.code] ||
                    AntigensDisaggregation.buildForAntigen(this.config, antigen.code, undefined)
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
        const errors = _(this.getEnabled())
            .flatMap(antigen => antigen.dataElements)
            .flatMap(dataElement => dataElement.categories)
            .map(category =>
                _(category.categoryOptions).isEmpty()
                    ? { key: "select_at_least_one_option_for_category", namespace: {} }
                    : null
            )
            .compact()
            .value();

        return errors;
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

        return categoriesForAntigen.map((categoryRef): AntigenDisaggregationCategoriesData[0] => {
            const optional = categoryRef.optional;
            const category = _(categoriesByCode).getOrFail(categoryRef.code);
            const isDosesCategory = category.code === config.categoryCodeForDoses;
            const isAntigensCategory = category.code === config.categoryCodeForAntigens;
            const isCampaignTypeCategory = category.code === config.categoryCodeForCampaignType;
            const {
                $categoryOptions,
                name: categoryName,
                ...categoryAttributes
            } = _(config.categoriesDisaggregation).keyBy(getCode).getOrFail(categoryRef.code);

            let groups: CategoryOption[][][];
            if ($categoryOptions.kind === "fromAgeGroups") {
                groups = antigenConfig.ageGroups;
            } else if ($categoryOptions.kind === "fromAntigens") {
                groups = config.antigens.map(antigen => [[antigen]]);
            } else if ($categoryOptions.kind === "fromDoses") {
                groups = antigenConfig.doses.map(dose => [[dose]]);
            } else {
                groups = $categoryOptions.values.map(option => [[option]]);
            }

            const categoryOptionsEnabled = _(section ? section.greyedFields : [])
                .flatMap(greyedField => {
                    return greyedField.categoryOptionCombo.categoryOptions.filter(
                        categoryOption => {
                            return categoryOption.categories.some(
                                greyedFieldCategory => greyedFieldCategory.id === category.id
                            );
                        }
                    );
                })
                .uniq()
                .value();

            const wasCategorySelected = !_(categoryOptionsEnabled).isEmpty();

            const options = getCategoryOptions(
                antigenConfig,
                category,
                groups,
                categoryOptionsEnabled
            );

            const selected = wasCategorySelected ? true : !optional;

            // Example: _23.6 Displacement Status
            const cleanCategoryName = categoryName
                .replace(/^[_\d.\s]+/, "")
                .replace("RVC", "")
                .trim();

            return {
                ...categoryAttributes,
                name: cleanCategoryName,
                optional: optional,
                selected: selected,
                options: options,
                visible: !(isDosesCategory || isAntigensCategory || isCampaignTypeCategory),
            };
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
                            .map(category => {
                                const categoryOptions = _(category.options)
                                    .flatMap(({ values, indexSelected }) => values[indexSelected])
                                    .compact()
                                    .filter(categoryOption => categoryOption.selected)
                                    .value();
                                return {
                                    code: category.code,
                                    categoryOptions: categoryOptions.map(obj => obj.option),
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
                    },
                    dataElements: dataElements,
                };
            }
        );

        return enabled;
    }

    static buildForAntigen(
        config: MetadataConfig,
        antigenCode: string,
        section: Maybe<SectionForDisaggregation>
    ): AntigenDisaggregation {
        const antigenConfig = _(config.antigens).keyBy(getCode).get(antigenCode);

        if (!antigenConfig) throw new Error(`No configuration for antigen: ${antigenCode}`);

        const dataElementsProcessed = antigenConfig.dataElements.map(dataElementRef => {
            const dataElementConfig = _(config.dataElementsDisaggregation)
                .keyBy(getCode)
                .getOrFail(dataElementRef.code);

            const categoriesDisaggregation = AntigensDisaggregation.getCategories(
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

        const disaggregation = AntigenDisaggregation.create({
            id: antigenConfig.id,
            name: antigenConfig.name,
            code: antigenConfig.code,
            dataElements: dataElementsProcessed,
            doses: antigenConfig.doses,
            isTypeSelectable: antigenConfig.isTypeSelectable,
        });

        return !disaggregation.isTypeSelectable
            ? disaggregation.updateCampaignType("reactive")
            : disaggregation;
    }

    public async getCocMetadata(db: DbD2): Promise<CocMetadata> {
        const categoryComboCodes = _(this.getEnabled())
            .flatMap(disaggregation => disaggregation.dataElements)
            .filter(dataElement => !_(dataElement.categories).isEmpty())
            .map(dataElement => getRvcCode(dataElement.categories.map(category => category.code)))
            .uniq()
            .value();

        // Add age groups required by target population data values
        const allCategoryComboCodes = [
            ...categoryComboCodes,
            this.config.categoryCodeForAgeGroup,
            this.config.categoryComboCodeForAntigenDosesAgeGroup,
            this.config.categoryComboCodeForAntigenDosesAgeGroupType,
        ];
        const categoryOptionCombos = await db.getCocsByCategoryComboCode(allCategoryComboCodes);

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
            return cocsByOptionsKey[key];
        }

        return { getByOptions: getCocIdByCategoryOptions };
    }
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
