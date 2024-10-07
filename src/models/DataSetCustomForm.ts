import { MetadataConfig } from "./config";
import _ from "lodash";
import i18n from "@dhis2/d2-i18n";

import Campaign, { Antigen } from "./campaign";
import { AntigenDisaggregationEnabled, CocMetadata } from "./AntigensDisaggregation";
import "../utils/lodash-mixins";
import { CategoryOption, getCode, getId } from "./db.types";
import { DataInput, getDataInputFromCampaign } from "./CampaignDb";

const { createElement } = require("typed-html");
const contentScript = require("!raw-loader!./custom-form-resources/content-script.js").default;
const cssContents = require("!raw-loader!./custom-form-resources/form.css").default;

type Children = string[];
type Disaggregations = AntigenDisaggregationEnabled;
type DataElement = Disaggregations[0]["dataElements"][0];
type Category = DataElement["categories"][0];

type Maybe<T> = T | undefined;

interface ObjectWithTranslation {
    id: string;
    name: string;
    displayName: string;
    translations: Array<{ property: string; locale: string; value: string }>;
}

// Alternative: Model with metadata, using 2 coGroups + 1 coGroupSet.
const combinationCodesToSkip = [
    ["M", "PREGNANT"],
    ["M", "CHILDBEARING_AGE"],
];

function h(tagName: string, attributes: object = {}, children: string | string[] = []) {
    const attrs = Object.keys(attributes).length === 0 ? undefined : attributes;
    const args = typeof children === "string" ? [children] : _.compact(children);
    return createElement(tagName, attrs, ...args);
}

function td(children: string, attributes: object = {}): string {
    return h("td", attributes, children);
}

function inputTd(dataElementId: string, cocId: string): string {
    return td(
        h("input", {
            name: "entryfield",
            class: "entryfield",
            id: `${dataElementId}-${cocId}-val`,
            autocomplete: "off",
        })
    );
}

function totalTh(rowSpan: number, isSplit: boolean): string {
    return h(
        "th",
        { rowspan: rowSpan, class: "data-header", "data-translate": true },
        h("span", { align: "center" }, isSplit ? i18n.t("Subtotal") : i18n.t("Total"))
    );
}

function totalTd(dataElementId: string, cocIds: string[]): string {
    return td(
        h("input", {
            class: "total-cell",
            id: `row-${dataElementId}-${cocIds.join("-")}`,
            disabled: "",
        })
    );
}

type Translations = { [text: string]: { [locale: string]: string } };

export class DataSetCustomForm {
    config: MetadataConfig;
    dataElementCodeDosesRegexp = /DOSES/;
    generalIndicatorsTabId = "GENERAL_QS";

    constructor(
        public campaign: Campaign,
        private metadata: CocMetadata,
        private disaggregations: Disaggregations,
        private translations: Translations
    ) {
        this.config = campaign.config;
    }

    static async build(campaign: Campaign, metadata: CocMetadata): Promise<DataSetCustomForm> {
        const disaggregations = campaign.getEnabledAntigensDisaggregation();
        const translations = await DataSetCustomForm.createTranslations(campaign, disaggregations);
        return new DataSetCustomForm(campaign, metadata, disaggregations, translations);
    }

    getDisaggregationCombinations(options: {
        categoryOptionGroups: CategoryOption[][];
        antigen?: Antigen;
        dataElement?: DataElement;
        dose?: CategoryOption;
    }): CategoryOption[][] {
        const { antigen, dataElement, categoryOptionGroups, dose } = options;
        const categoryDoses = dataElement ? this.getDosesCategory(dataElement) : undefined;
        const doses =
            categoryDoses && !dose ? [categoryDoses.categoryOptions] : dose ? [[dose]] : [];
        const categoryOptionGroupsWithType = this.setTypeOnGroups(antigen, categoryOptionGroups);
        const categoryOptionGroupsAll = [...doses, ...categoryOptionGroupsWithType];

        const combinations = _.cartesianProduct(categoryOptionGroupsAll).map(categoryOptions => {
            const disaggregation = _.compact([antigen, ...categoryOptions]);
            const codes = disaggregation.map(co => co.code);
            const toSkip = combinationCodesToSkip.some(codesToSkip =>
                _.isEmpty(_.difference(codesToSkip, codes))
            );
            return toSkip ? undefined : disaggregation;
        });

        return _.compact(combinations);
    }

    private setTypeOnGroups(
        antigen: Antigen | undefined,
        categoryOptionGroups: CategoryOption[][]
    ): CategoryOption[][] {
        if (!antigen) return categoryOptionGroups;

        const disaggregation = this.campaign.antigensDisaggregation.forAntigen(antigen);
        if (!disaggregation) return categoryOptionGroups;

        const categoryOptionCodeForType =
            disaggregation.type === "preventive"
                ? this.config.categoryOptionCodePreventive
                : this.config.categoryOptionCodeReactive;

        return categoryOptionGroups.map(categoryOptions => {
            const categoryOptionForType = categoryOptions.find(
                categoryOption => categoryOption.code === categoryOptionCodeForType
            );
            return categoryOptionForType ? [categoryOptionForType] : categoryOptions;
        });
    }

    getCocIds(combinations: CategoryOption[][]): string[] {
        return combinations.map(disaggregation => {
            const cocId = this.metadata.getByOptions(disaggregation);
            if (!cocId)
                throw new Error(
                    `[DataSetCustomForm] coc not found: ${disaggregation
                        .map(co => co.name)
                        .join(", ")}`
                );
            return cocId;
        });
    }

    renderDataElement(
        antigen: Maybe<Antigen>,
        dataElement: DataElement,
        categoryOptionGroups: CategoryOption[][],
        idx: number
    ): string[] {
        const trType = idx === 0 ? "primary" : "secondary";
        const trClass = ["derow", `de-${dataElement.id}`, trType].join(" ");

        // Doses are rendered as a separate data element rows
        const categoryDoses = this.getDosesCategory(dataElement);
        const doses: Array<CategoryOption | undefined> = categoryDoses
            ? categoryDoses.categoryOptions
            : [undefined];
        const showDoseName = doses.length > 1;

        return doses.map(dose => {
            const combinations = this.getDisaggregationCombinations({
                antigen: antigen,
                dataElement: dataElement,
                categoryOptionGroups,
                dose: dose,
            });
            const cocIds = this.getCocIds(combinations);
            const dataElementId = dataElement.id;
            const renderTotalCell = cocIds.length > 1;

            return h("tr", { class: trClass }, [
                h("td", { class: "data-element", "data-translate": true }, [
                    h("span", { "data-translate": true }, dataElement.name),
                    showDoseName
                        ? h("span", {}, " - ") +
                          h("span", { "data-translate": true }, dose ? dose.name : "-")
                        : null,
                ]),
                ...cocIds.map(cocId => inputTd(dataElementId, cocId)),
                renderTotalCell ? totalTd(dataElementId, cocIds) : null,
            ]);
        });
    }

    getDataElementByCategoryOptionsLists(dataElements: DataElement[]) {
        const { categoryCodeForAntigens, categoryCodeForDoses } = this.config;
        const outerCategories = [categoryCodeForAntigens, categoryCodeForDoses];

        return _(dataElements)
            .groupBy(({ categories }) =>
                categories.map(category => [category.code, ...category.categoryOptions])
            )
            .values()
            .map(dataElementsGroup => {
                const categoryOptionGroups = _(dataElementsGroup[0]?.categories)
                    .reject(category => _(outerCategories).includes(category.code))
                    .map(cat => cat.categoryOptions)
                    .value();

                // Tables may be too wide to fit in the screen, so here we return a second
                // group of tables (one table per category option) to reduce the width.
                // On dataentry render, JS code (processWideTables) -run in the client-
                // will show only the table that better fits the viewport.

                return {
                    dataElements: dataElementsGroup,
                    categoryOptionGroupsList: _.compact([
                        [categoryOptionGroups],
                        _(categoryOptionGroups).size() <= 1
                            ? null
                            : (categoryOptionGroups[0] || []).map(group => [
                                  [group],
                                  ..._.tail(categoryOptionGroups),
                              ]),
                    ]),
                };
            })
            .value();
    }

    renderGroupWrapper(
        antigen: Maybe<Antigen>,
        data: {
            dataElements: DataElement[];
            categoryOptionGroupsList: CategoryOption[][][][];
        }
    ) {
        const { dataElements, categoryOptionGroupsList } = data;

        return h(
            "div",
            { class: "tableGroupWrapper" },
            _.flatMap(categoryOptionGroupsList, categoryOptionGroupsArray =>
                h(
                    "div",
                    { class: "tableGroup" },
                    categoryOptionGroupsArray
                        .map((categoryOptionGroups, idx) => {
                            const disaggregations = this.getDisaggregationCombinations({
                                categoryOptionGroups:
                                    removeCampaignTypeCategory(categoryOptionGroups),
                            });

                            return h("table", { class: "dataValuesTable" }, [
                                h(
                                    "thead",
                                    {},
                                    renderHeaderForGroup(
                                        disaggregations,
                                        categoryOptionGroupsArray.length > 1
                                    )
                                ),
                                h(
                                    "tbody",
                                    {},
                                    _.flatMap(dataElements, dataElement =>
                                        this.renderDataElement(
                                            antigen,
                                            dataElement,
                                            categoryOptionGroups,
                                            idx
                                        )
                                    )
                                ),
                            ]);
                        })
                        .concat(
                            this.renderTotalTables(antigen, dataElements, categoryOptionGroupsArray)
                        )
                )
            )
        );
    }

    private getDosesCategory(dataElement: DataElement): Maybe<Category> {
        const { categoryCodeForDoses } = this.config;
        return dataElement.categories.find(category => category.code === categoryCodeForDoses);
    }

    private renderTotalTables(
        antigen: Maybe<Antigen>,
        dataElements: DataElement[],
        categoryOptionGroupsArray: CategoryOption[][][]
    ): Children {
        const areTablesSplit = categoryOptionGroupsArray.length > 1;
        const dataElementDoses = dataElements.find(de => !!this.getDosesCategory(de));
        const categoryDoses = dataElementDoses ? this.getDosesCategory(dataElementDoses) : null;
        const hasDosesSplit = categoryDoses && categoryDoses.categoryOptions.length > 1;
        const dataElementsToShow =
            dataElementDoses && (areTablesSplit || hasDosesSplit) ? [dataElementDoses] : [];

        return dataElementsToShow.map(dataElement =>
            h("table", { class: "dataValuesTable" }, [
                h("thead", {}, [
                    h("td", { class: "header-first-column" }),
                    h(
                        "th",
                        { class: "data-header", "data-translate": true },
                        h("span", { align: "center" }, i18n.t("Total"))
                    ),
                ]),
                h(
                    "tbody",
                    {},
                    h("tr", { class: `derow de-${dataElement.id} secondary` }, [
                        h(
                            "td",
                            { class: "data-element", "data-translate": true },
                            dataElement.name
                        ),
                        totalTd(
                            dataElement.id,
                            _.flatMap(categoryOptionGroupsArray, categoryOptionGroupsGroups =>
                                this.getCocIds(
                                    this.getDisaggregationCombinations({
                                        antigen: antigen,
                                        dataElement: dataElement,
                                        categoryOptionGroups: categoryOptionGroupsGroups,
                                    })
                                )
                            )
                        ),
                    ])
                ),
            ])
        );
    }

    renderAntigenTab(disaggregation: Disaggregations[0]): string {
        const { antigen, dataElements: allDataElements } = disaggregation;
        const dataElementHasAntigenDisaggregation = (dataElement: DataElement) =>
            _(dataElement.categories).some(
                deCategory => deCategory.code === this.config.categoryCodeForAntigens
            );

        const [dosesDataElements = [], qualityDataElements = []] = _(allDataElements)
            .filter(dataElementHasAntigenDisaggregation)
            .partition(de => de.code.match(this.dataElementCodeDosesRegexp))
            .value();

        const groups = [
            { title: i18n.t("Doses administered"), dataElements: dosesDataElements },
            { title: i18n.t("Quality and safety indicators"), dataElements: qualityDataElements },
        ];

        return this.renderTab(antigen.id, groups, { antigen: disaggregation.antigen });
    }

    private renderTab(
        id: string,
        groups: Array<{ title?: string; dataElements: DataElement[] }>,
        options: { antigen?: Antigen }
    ): string {
        return h(
            "div",
            {
                id: `tab-${id}`,
                role: "tabpanel",
                class: "ui-tabs-panel ui-corner-bottom ui-widget-content",
            },
            h(
                "div",
                {},
                _.flatMap(groups, ({ title, dataElements }) => [
                    h("div", { class: "dataelement-group" }, [
                        title ? h("div", { class: "title", "data-translate": true }, title) : null,
                        h(
                            "div",
                            { class: "formSection sectionContainer" },
                            _.flatMap(
                                this.getDataElementByCategoryOptionsLists(dataElements),
                                data => this.renderGroupWrapper(options.antigen, data)
                            )
                        ),
                    ]),
                ])
            )
        );
    }

    getGeneralDataElements(disaggregations: Disaggregations): DataElement[] {
        const hasAntigensDisaggregation = (dataElement: DataElement) =>
            !_(dataElement.categories)
                .map(getCode)
                .includes(this.config.dataElementGroupCodeForAntigens);

        return _(disaggregations)
            .flatMap("dataElements")
            .filter(hasAntigensDisaggregation)
            .uniqBy(getId)
            .value();
    }

    renderGeneralIndicatorsTab(disaggregations: Disaggregations): string | null {
        const generalDataElements = this.getGeneralDataElements(disaggregations);

        if (_(generalDataElements).isEmpty()) {
            return null;
        } else {
            return this.renderTab(
                this.generalIndicatorsTabId,
                [{ dataElements: generalDataElements }],
                {}
            );
        }
    }

    renderTabs(disaggregations: Disaggregations): string {
        const generalDataElements = this.getGeneralDataElements(disaggregations);

        const tabs = _.compact([
            ...disaggregations.map(disaggregation => {
                const { antigen } = disaggregation;

                const type =
                    disaggregation.type === "preventive"
                        ? i18n.t("Preventive")
                        : i18n.t("Reactive");

                const name = `[${type}] ${antigen.name}`;
                return { name: name, id: antigen.id };
            }),
            !_(generalDataElements).isEmpty()
                ? { name: i18n.t("General Q&S"), id: this.generalIndicatorsTabId }
                : null,
        ]);

        return h(
            "ul",
            {
                role: "tablist",
                class: "ui-tabs-nav ui-corner-all ui-helper-reset ui-helper-clearfix ui-widget-header",
            },
            tabs.map(tab =>
                h(
                    "li",
                    {
                        role: "tab",
                        tabindex: "-1",
                        class: "ui-tabs-tab ui-corner-top ui-state-default ui-tab",
                    },
                    h(
                        "a",
                        {
                            href: `#tab-${tab.id}`,
                            role: "presentation",
                            tabindex: "-1",
                            class: "ui-tabs-anchor",
                            "data-translate": true,
                        },
                        tab.name
                    )
                )
            )
        );
    }

    static async createTranslations(
        campaign: Campaign,
        disaggregations: Disaggregations
    ): Promise<Translations> {
        const locales = Object.keys(i18n.store.data);

        const generalTranslations = _([
            "Subtotal",
            "Total",
            "Value",
            "Doses administered",
            "Quality and safety indicators",
            "General Q&S",
        ])
            .map(text => [i18n.t(text), i18n.t(text, { lng: "en" })] as [string, string])
            .fromPairs()
            .value();

        const validationTranslations = {
            selectedPeriodNotInCampaignRange: i18n.t(
                "Selected period ({selectedPeriod}) is not in the campaign period range ({periodStart} -> {periodEnd})",
                { lng: "en" }
            ),
            currentDateNotInCampaignEntryRange: i18n.t(
                "Current date ({currentDate}) is not in the campaign entry range ({openingDate} -> {closingDate})",
                { lng: "en" }
            ),
        };

        const interfaceTranslations = { ...generalTranslations, ...validationTranslations };

        const interfaceTranslationsByLocale = _(interfaceTranslations)
            .toPairs()
            .map(([key, text]) => [
                key,
                _(locales)
                    .map(locale => [locale, i18n.t(text, { lng: locale })])
                    .fromPairs()
                    .value(),
            ])
            .fromPairs()
            .value();

        const categoryOptionsIdById = _.keyBy(campaign.config.categoryOptions, co => co.id);
        const ids = _.uniq([
            ..._(disaggregations)
                .flatMap(dis => dis.dataElements)
                .map(getId)
                .value(),
            ..._(disaggregations)
                .map(dis => dis.antigen.id)
                .value(),
            ..._(disaggregations)
                .flatMap(dis => dis.dataElements)
                .flatMap(dataElement => dataElement.categories)
                .flatMap(category => category.categoryOptions)
                .map(co => _(categoryOptionsIdById).get(co.id).id)
                .uniq()
                .value(),
        ]);

        const { categoryOptions, dataElements } = await campaign.db.getMetadata<{
            categoryOptions: ObjectWithTranslation[];
            dataElements: ObjectWithTranslation[];
        }>({
            global: {
                fields: { id: true, name: true, displayName: true, translations: true },
                filters: [`id:in:[${ids.join(",")}]`],
            },
        });

        const metadataTranslationsByLocale = _(categoryOptions)
            .concat(dataElements)
            .map(object => [
                object.displayName,
                _(locales)
                    .map(locale => [
                        locale,
                        _(object.translations)
                            .filter(translation => translation.property === "NAME")
                            .keyBy("locale")
                            .get([locale, "value"]) || object.name,
                    ])
                    .fromPairs()
                    .value(),
            ])
            .fromPairs()
            .value();

        return { ...metadataTranslationsByLocale, ...interfaceTranslationsByLocale };
    }

    generate(): string {
        const options: CustomFormOptions = {
            translations: this.translations,
            dataElements: _.fromPairs(this.config.dataElements.map(de => [de.id, de.code])),
            dataInput: getDataInputFromCampaign(this.campaign),
        };
        const toJSON = (obj: any) => JSON.stringify(obj, null, 2);
        // Remove the empty export (it's required by the linter, but does not work on a browser)
        const contentScriptClean = contentScript.replace("export {}", "");

        return h(
            "div",
            { id: "tabs", class: "ui-tabs ui-corner-all ui-widget ui-widget-content" },
            [
                this.renderTabs(this.disaggregations),
                ...this.disaggregations.map(disaggregation =>
                    this.renderAntigenTab(disaggregation)
                ),
                this.renderGeneralIndicatorsTab(this.disaggregations),
                h("style", {}, cssContents),
                h("script", {}, [contentScriptClean, `init(${toJSON(options)})`].join("\n")),
            ]
        );
    }
}

function removeCampaignTypeCategory(categoryOptionGroups: CategoryOption[][]) {
    return _(categoryOptionGroups)
        .reject(categoryOptions => {
            const isCampaignType = _(categoryOptions).some(categoryOption => {
                return ["RVC_PREVENTIVE", "RVC_REACTIVE"].includes(categoryOption.code);
            });
            return isCampaignType;
        })
        .value();
}

export function renderHeaderForGroup(
    categoryOptionGroups: CategoryOption[][],
    isSubTotal: boolean
): Children {
    const firstCombination = _.first(categoryOptionGroups);
    const noDisaggregation = _(categoryOptionGroups).sumBy(group => group.length) === 0;

    if (!firstCombination || noDisaggregation) {
        return [
            h("td", { class: "header-first-column" }, "&nbsp;"),
            h(
                "th",
                { colspan: "1", scope: "col", class: "data-header", "data-translate": true },
                i18n.t("Value")
            ),
        ];
    }

    const rowsCount = firstCombination.length;

    // To build the header merging, group consecutive categoryOptions up until the level
    // being rendered, and use the count as the colspan.
    return _(0)
        .range(rowsCount)
        .map(rowIndex => {
            const categoryOptionsForRow = categoryOptionGroups.map(categoryOptions => {
                return categoryOptions.slice(0, rowIndex + 1);
            });
            const showTotalField = categoryOptionGroups.length > 1 && rowIndex === 0;

            return h("tr", {}, [
                h("td", { class: "header-first-column" }),
                groupConsecutives(categoryOptionsForRow).map(groups => {
                    const categoryOptions = groups.map(group => _.last(group));
                    const categoryOption = _.first(categoryOptions);
                    if (!categoryOption) throw new Error("categoryOption is undefined");

                    return h(
                        "th",
                        {
                            colspan: categoryOptions.length,
                            scope: "col",
                            class: "data-header",
                            "data-translate": true,
                        },
                        h("span", { align: "center" }, categoryOption.displayName)
                    );
                }),
                showTotalField ? totalTh(rowsCount, isSubTotal) : null,
            ]);
        })
        .value();
}

function groupConsecutives<T>(items: T[]): T[][] {
    return _.reduce(
        items,
        (result, values) => {
            const lastGroup = _.last(result);
            const lastInLastGroup = _.last(lastGroup);

            if (lastGroup && lastInLastGroup && _.isEqual(lastInLastGroup, values)) {
                lastGroup.push(values);
            } else {
                result.push([values]);
            }
            return result;
        },
        [] as T[][]
    );
}

type Id = string;
type Code = string;

interface CustomFormOptions {
    translations: object;
    dataElements: Record<Id, Code>;
    dataInput: Maybe<DataInput>;
}
