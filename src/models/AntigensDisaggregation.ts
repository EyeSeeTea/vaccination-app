import { DataElement, Maybe, Ref } from "./db.types";
import _ from "lodash";
const fp = require("lodash/fp");
import { MetadataConfig, getCode } from "./config";
import { Antigen } from "./campaign";
import "../utils/lodash-mixins";
import DbD2 from "./db-d2";

export interface AntigenDisaggregation {
    name: string;
    code: string;
    id: string;
    doses: Array<{ id: string; name: string }>;
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
                values: Array<Array<{ name: string; selected: boolean }>>;
            }>;
        }>;
    }>;
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

export type AntigenDisaggregationCategoriesData = AntigenDisaggregation["dataElements"][0]["categories"];

export type AntigenDisaggregationOptionGroup = AntigenDisaggregationCategoriesData[0]["options"][0];

export type AntigenDisaggregationEnabled = Array<{
    antigen: Antigen;
    ageGroups: Array<string>;
    dataElements: Array<{
        id: string;
        name: string;
        code: string;
        categories: Array<{ code: string; categoryOptions: string[] }>;
    }>;
}>;

export type CocMetadata = {
    cocIdByName: _.Dictionary<string>;
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
        const antigensByCode = _.keyBy(config.antigens, "code");
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
        const disaggregationByCode = _.keyBy(this.data.disaggregation, "code");
        const disaggregationUpdated = _(antigens)
            .keyBy("code")
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
        const categoriesByCode = _.keyBy(config.categories, "code");

        return dataElementConfig.categories.map(categoryRef => {
            const optional = categoryRef.optional;
            const category = _(categoriesByCode).getOrFail(categoryRef.code);
            const isDosesCategory = category.code === config.categoryCodeForDoses;
            const isAntigensCategory = category.code === config.categoryCodeForAntigens;
            const { $categoryOptions, name: categoryName, ...categoryAttributes } = _(
                config.categoriesDisaggregation
            )
                .keyBy("code")
                .getOrFail(categoryRef.code);

            let groups: string[][][];
            if ($categoryOptions.kind === "fromAgeGroups") {
                groups = antigenConfig.ageGroups;
            } else if ($categoryOptions.kind === "fromAntigens") {
                groups = config.antigens.map(antigen => [[antigen.name]]);
            } else if ($categoryOptions.kind === "fromDoses") {
                groups = antigenConfig.doses.map(dose => [[dose.name]]);
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
                .map(categoryOption => categoryOption.displayName)
                .uniq()
                .value();

            const wasCategorySelected = !_(categoryOptionsEnabled).isEmpty();

            const options = groups.map(optionGroup => {
                const index = wasCategorySelected
                    ? _(optionGroup).findIndex(
                          options =>
                              !_(options)
                                  .intersection(categoryOptionsEnabled)
                                  .isEmpty()
                      )
                    : 0;
                const indexSelected = index >= 0 ? index : 0;

                return {
                    indexSelected,
                    values: optionGroup.map((options, optionGroupIndex) => {
                        const isOptionGroupSelected =
                            wasCategorySelected && indexSelected === optionGroupIndex;
                        return options.map(optionName => ({
                            name: optionName,
                            selected: isOptionGroupSelected
                                ? _(categoryOptionsEnabled).includes(optionName)
                                : true,
                        }));
                    }),
                };
            });

            const selected = wasCategorySelected ? true : !optional;

            // Example: _23.6 Displacement Status
            const cleanCategoryName = categoryName
                .replace(/^[_\d.\s]+/, "")
                .replace("RVC", "")
                .trim();

            return {
                ...categoryAttributes,
                name: cleanCategoryName,
                optional,
                selected,
                options,
                visible: !(isDosesCategory || isAntigensCategory),
            };
        });
    }

    getEnabled(): AntigenDisaggregationEnabled {
        const antigenDisaggregations = _(this.data.antigens)
            .map(this.forAntigen.bind(this))
            .compact()
            .value();

        const enabled = antigenDisaggregations.map(antigenDisaggregation => {
            const dataElements = _(antigenDisaggregation.dataElements)
                .filter("selected")
                .map(dataElement => {
                    const categories = _(dataElement.categories)
                        .filter("selected")
                        .map(category => {
                            const categoryOptions = _(category.options)
                                .flatMap(({ values, indexSelected }) => values[indexSelected])
                                .filter("selected")
                                .map("name")
                                .value();
                            return { code: category.code, categoryOptions };
                        })
                        .value();
                    return {
                        id: dataElement.id,
                        code: dataElement.code,
                        name: dataElement.name,
                        categories,
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
                antigen: {
                    code: antigenDisaggregation.code,
                    name: antigenDisaggregation.name,
                    id: antigenDisaggregation.id,
                    doses: antigenDisaggregation.doses,
                },
                dataElements,
            };
        });

        return enabled;
    }

    static buildForAntigen(
        config: MetadataConfig,
        antigenCode: string,
        section: Maybe<SectionForDisaggregation>
    ): AntigenDisaggregation {
        const antigenConfig = _(config.antigens)
            .keyBy("code")
            .get(antigenCode);

        if (!antigenConfig) throw `No configuration for antigen: ${antigenCode}`;

        const dataElementsProcessed = antigenConfig.dataElements.map(dataElementRef => {
            const dataElementConfig = _(config.dataElementsDisaggregation)
                .keyBy("code")
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

        const res = {
            id: antigenConfig.id,
            name: antigenConfig.name,
            code: antigenConfig.code,
            dataElements: dataElementsProcessed,
            doses: antigenConfig.doses,
        };

        return res;
    }

    public async getCocMetadata(db: DbD2): Promise<CocMetadata> {
        const categoryComboCodes = _(this.getEnabled())
            .flatMap(disaggregation => disaggregation.dataElements)
            .filter(dataElement => !_(dataElement.categories).isEmpty())
            .map(dataElement => getCode(dataElement.categories.map(category => category.code)))
            .uniq()
            .value();

        const categoryOptionsDisplayNameByName = _(this.config.categoryOptions)
            .map(co => [co.name, co.displayName])
            .fromPairs()
            .value();

        // Add age groups required by target population data values
        const allCategoryComboCodes = [
            ...categoryComboCodes,
            this.config.categoryCodeForAgeGroup,
            this.config.categoryComboCodeForAntigenDosesAgeGroup,
        ];
        const categoryOptionCombos = await db.getCocsByCategoryComboCode(allCategoryComboCodes);

        const getTranslatedCocName: (coNames: string[]) => string = coNames => {
            return coNames
                .map(coName => _(categoryOptionsDisplayNameByName).getOrFail(coName))
                .join(", ");
        };

        const categoryOptionCombosIdByName = _(categoryOptionCombos)
            .map(coc => [getTranslatedCocName(coc.categoryOptionNames), coc.id])
            .push(["", this.config.defaults.categoryOptionCombo.id])
            .fromPairs()
            .value();

        return { cocIdByName: categoryOptionCombosIdByName };
    }
}

export function getDataElements(
    config: MetadataConfig,
    disaggregationData: AntigenDisaggregationEnabled
): DataElement[] {
    const dataElementsByCode = _(config.dataElements).keyBy("code");
    return _(disaggregationData)
        .flatMap(dd => dd.dataElements.map(de => de.code))
        .uniq()
        .map(deCode => dataElementsByCode.getOrFail(deCode))
        .value();
}
