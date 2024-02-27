import { MetadataConfig } from "./config";
import _ from "lodash";
const { createElement } = require("typed-html");

import Campaign, { Antigen } from "./campaign";
import { AntigenDisaggregationEnabled, CocMetadata } from "./AntigensDisaggregation";
import i18n from "../locales";
import "../utils/lodash-mixins";
import { DataInput, getDataInputFromCampaign } from "./CampaignDb";

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

function h(tagName: string, attributes: object = {}, children: string | string[] = []) {
    const attrs = Object.keys(attributes).length === 0 ? undefined : attributes;
    const args = typeof children === "string" ? [children] : _.compact(children);
    return createElement(tagName, attrs, ...args);
}

function repeatArray<T>(xs: T[], count: number): T[] {
    return _.flatten(_.times(count, () => xs));
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

function totalTh(categoryOptionGroups: string[][], isSplit: boolean): string {
    return h(
        "th",
        { rowspan: categoryOptionGroups.length, class: "data-header", "data-translate": true },
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

    renderHeaderForGroup(categoryOptionGroups: string[][], isSubTotal: boolean): Children {
        const total =
            _(categoryOptionGroups)
                .map(cos => cos.length)
                .reduce(_.multiply) || 0;

        if (total === 0) {
            return [
                h("td", { class: "header-first-column" }, "&nbsp;"),
                h(
                    "th",
                    { colspan: "1", scope: "col", class: "data-header", "data-translate": true },
                    i18n.t("Value")
                ),
            ];
        }

        const headers = _.flatten(categoryOptionGroups);
        const initial: { trs: string[]; count: number; repeat: number } = {
            trs: [],
            count: total,
            repeat: 1,
        };

        return _(categoryOptionGroups).reduce(({ trs, count, repeat }, categoryOptions, idx) => {
            const newCount = count / categoryOptions.length;
            const showTotalField = headers.length > 1 && idx === 0;
            const tr = h("tr", {}, [
                h("td", { class: "header-first-column" }),
                ...repeatArray(
                    categoryOptions.map(categoryOptionName =>
                        h(
                            "th",
                            {
                                colspan: newCount,
                                scope: "col",
                                class: "data-header",
                                "data-translate": true,
                            },
                            h("span", { align: "center" }, categoryOptionName)
                        )
                    ),
                    repeat
                ),
                showTotalField ? totalTh(categoryOptionGroups, isSubTotal) : null,
            ]);
            return {
                trs: trs.concat([tr]),
                count: newCount,
                repeat: repeat * categoryOptions.length,
            };
        }, initial).trs;
    }

    getCocIds(
        antigen: Maybe<Antigen>,
        dataElement: DataElement,
        categoryOptionGroups: string[][],
        options: { doseName?: string }
    ): string[] {
        const { doseName } = options;
        const categoryDoses = this.getDosesCategory(dataElement);
        const dosesNames =
            categoryDoses && doseName === undefined
                ? [categoryDoses.categoryOptions]
                : doseName
                ? [[doseName]]
                : [];
        const categoryOptionGroupsAll = [...dosesNames, ...categoryOptionGroups];

        return _.cartesianProduct(categoryOptionGroupsAll).map(categoryOptionNames => {
            const cocName = _([antigen ? antigen.name : null, ...categoryOptionNames])
                .compact()
                .join(", ");
            return _(this.metadata.cocIdByName).getOrFail(cocName);
        });
    }

    renderDataElement(
        antigen: Maybe<Antigen>,
        dataElement: DataElement,
        categoryOptionGroups: string[][],
        idx: number
    ): string[] {
        const trType = idx === 0 ? "primary" : "secondary";
        const trClass = ["derow", `de-${dataElement.id}`, trType].join(" ");

        // Doses are rendered as a separate data element rows
        const categoryDoses = this.getDosesCategory(dataElement);
        const dosesNames: Array<string | undefined> = categoryDoses
            ? categoryDoses.categoryOptions
            : [undefined];
        const showDoseName = dosesNames.length > 1;

        return dosesNames.map(doseName => {
            const cocIds = this.getCocIds(antigen, dataElement, categoryOptionGroups, { doseName });
            const dataElementId = dataElement.id;
            const renderTotalCell = cocIds.length > 1;

            return h("tr", { class: trClass }, [
                h("td", { class: "data-element", "data-translate": true }, [
                    h("span", { "data-translate": true }, dataElement.name),
                    showDoseName
                        ? h("span", {}, " - ") + h("span", { "data-translate": true }, doseName)
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
                const categoryOptionGroups = _(dataElementsGroup[0].categories)
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
                            : categoryOptionGroups[0].map(group => [
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
            categoryOptionGroupsList: string[][][][];
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
                        .map((categoryOptionGroups, idx) =>
                            h("table", { class: "dataValuesTable" }, [
                                h(
                                    "thead",
                                    {},
                                    this.renderHeaderForGroup(
                                        categoryOptionGroups,
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
                            ])
                        )
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
        categoryOptionGroupsArray: string[][][]
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
                        h("td", { class: "data-element" }, dataElement.name),
                        totalTd(
                            dataElement.id,
                            _.flatMap(categoryOptionGroupsArray, categoryOptionGroupsGroups =>
                                this.getCocIds(antigen, dataElement, categoryOptionGroupsGroups, {})
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
                deCategory => deCategory.code == this.config.categoryCodeForAntigens
            );

        const [dosesDataElements, qualityDataElements] = _(allDataElements)
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
                .map("code")
                .includes(this.config.dataElementGroupCodeForAntigens);

        return _(disaggregations)
            .flatMap("dataElements")
            .filter(hasAntigensDisaggregation)
            .uniqBy("id")
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
            ...disaggregations.map(({ antigen }) => ({ name: antigen.name, id: antigen.id })),
            !_(generalDataElements).isEmpty()
                ? { name: i18n.t("General Q&S"), id: this.generalIndicatorsTabId }
                : null,
        ]);

        return h(
            "ul",
            {
                role: "tablist",
                class:
                    "ui-tabs-nav ui-corner-all ui-helper-reset ui-helper-clearfix ui-widget-header",
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

        const categoryOptionsIdByName = _.keyBy(campaign.config.categoryOptions, "displayName");
        const ids = _.uniq([
            ..._(disaggregations)
                .flatMap(dis => dis.dataElements)
                .map("id")
                .value(),
            ..._(disaggregations)
                .map(dis => dis.antigen.id)
                .value(),
            ..._(disaggregations)
                .flatMap(dis => dis.dataElements)
                .flatMap(dataElement => dataElement.categories)
                .flatMap(category => category.categoryOptions)
                .map(co => _(categoryOptionsIdByName).get(co).id)
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

type Id = string;
type Code = string;

interface CustomFormOptions {
    translations: object;
    dataElements: Record<Id, Code>;
    dataInput: Maybe<DataInput>;
}
