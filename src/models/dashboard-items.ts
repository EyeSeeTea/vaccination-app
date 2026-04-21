import { getUid } from "../utils/dhis2";
import _ from "lodash";
import moment from "moment";
import i18n from "@dhis2/d2-i18n";
import {
    processDisaggregations,
    ModelDataDimensionItem,
    D2DataDimensionItem,
} from "./campaign-d2-visualizations";
import Campaign from "./campaign";
import { AntigenConfig } from "./config";
import { Ref } from "./db.types";
import { assert } from "../utils/assert";

type AreaType = "campaign" | "area" | "site";

type TitleFn = (ns: Record<string, string>) => string;

type ItemDefinition = {
    elements: string[];
    disaggregatedBy: string[];
    rows: string[];
    filterDataBy: string[];
    type?: string;
    showColumnTotals?: boolean;
    showRowSubTotals?: boolean;
    showColumnSubTotals?: boolean;
};

type ItemConfig = ItemDefinition & {
    area: AreaType;
    title: TitleFn;
    appendCode: string;
    legendCode?: string;
};

type DoseMetadata = {
    categoryId: string;
    doseId: string;
    name: string;
} | null;

type DisaggregationElement = {
    categoryId: string;
    elements: any[]; // string[] for teams/ageGroups, {id, name}[] for doses
};

type DisaggregationMetadata = {
    teams: () => DisaggregationElement;
    ageGroups: (antigen: AntigenConfig, dose: DoseMetadata) => DisaggregationElement;
    doses: (antigen: Ref) => DisaggregationElement | undefined;
};

type LegendsMetadata = {
    get: (code: string) => string;
};

type OrgUnitForVisualization = {
    id: string;
    parents: Record<string, string>;
    name: string;
};

type PeriodItem = { id: string };

type ItemsMetadata = {
    datasetName: string;
    periodItems: PeriodItem[];
    antigenCategory: string;
};

type ElementsMetadataEntry = {
    type: string;
    data: Array<{ id: string; code: string }>;
    key: string;
};

type DataDimensionItem = {
    dataDimensionItemType: string;
    [key: string]: { id: string; code: string } | string;
};

type ConstructorOptions = {
    id: string;
    campaign: Campaign;
    datasetName: string;
    antigen: AntigenConfig | null;
    periodItems: PeriodItem[];
    antigenCategory: string;
    data: ModelDataDimensionItem[] | D2DataDimensionItem[];
    type?: string;
    appendCode: string;
    organisationUnits: OrgUnitForVisualization[];
    disaggregations: DisaggregationElement[];
    area: AreaType;
    rows: string[];
    filterDataBy: string[];
    title: TitleFn;
    legendId?: string | null;
};

const definitions = {
    coverageByDosesAndPeriod: {
        elements: ["RVC_CAMPAIGN_COVERAGE"],
        disaggregatedBy: ["doses"],
        type: "COLUMN",
        rows: ["ou"],
        filterDataBy: ["pe"],
    },
    coverageByAgeGroupAndPeriod: {
        elements: ["RVC_DOSES_ADMINISTERED", "RVC_CAMPAIGN_COVERAGE"],
        rows: ["ou"],
        filterDataBy: ["pe"],
        disaggregatedBy: ["ageGroup"],
        showColumnTotals: false,
        showRowSubTotals: true,
        showColumnSubTotals: false,
    },
    administeredAndCoverageByDosesAndPeriod: {
        elements: ["RVC_DOSES_ADMINISTERED", "RVC_CAMPAIGN_COVERAGE"],
        rows: ["ou"],
        filterDataBy: ["pe"],
        disaggregatedBy: ["doses"],
        showRowSubTotals: false,
        showColumnSubTotals: false,
        showColumnTotals: false,
    },
    vaccinesPerPeriod: {
        elements: ["RVC_DOSES_ADMINISTERED", "RVC_DOSES_USED", "RVC_VACCINE_UTILIZATION"],
        rows: ["ou"],
        filterDataBy: ["pe"],
        disaggregatedBy: [],
    },
    globalQsIndicators: {
        elements: ["RVC_ADS_WASTAGE", "RVC_SAFETY_BOXES"],
        rows: ["ou"],
        filterDataBy: ["pe"],
        disaggregatedBy: [],
    },
};

export const dashboardItemsConfig: {
    metadataToFetch: { INDICATOR: string[]; DATA_ELEMENT: string[] };
    chartsByAntigen: Record<string, ItemConfig>;
    globalTables: Record<string, ItemConfig>;
    tablesByAntigenAndDose: Record<string, ItemConfig>;
    tablesByAntigen: Record<string, ItemConfig>;
    tablesByAntigenAndSite: Record<string, ItemConfig>;
} = {
    metadataToFetch: {
        INDICATOR: [
            "RVC_ADS_WASTAGE",
            "RVC_DILUTION_SYRINGES_RATIO",
            "RVC_SAFETY_BOXES",
            "RVC_CAMPAIGN_COVERAGE",
            "RVC_VACCINE_UTILIZATION",
            "RVC_CAMPAIGN_NEEDLES_RATIO",
            "RVC_AEFI_ALL_ANTIGENS",
        ],
        DATA_ELEMENT: ["RVC_AEB", "RVC_AEFI", "RVC_DOSES_ADMINISTERED", "RVC_DOSES_USED"],
    },
    chartsByAntigen: {
        coverageByCampaign: {
            ...definitions.coverageByDosesAndPeriod,
            area: "campaign",
            title: (ns: Record<string, string>) =>
                i18n.t("Coverage by Campaign {{- period}} (do not edit this chart)", ns),
            appendCode: "Coverage by campaign",
        },
        coverageByArea: {
            ...definitions.coverageByDosesAndPeriod,
            area: "area",
            title: (ns: Record<string, string>) =>
                i18n.t("Coverage by Area {{- period}} (do not edit this chart)", ns),
            appendCode: "Coverage by area",
        },
        coverageBySite: {
            ...definitions.coverageByDosesAndPeriod,
            area: "site",
            title: (ns: Record<string, string>) =>
                i18n.t("Coverage by Site {{- period}} (do not edit this chart)", ns),
            appendCode: "Coverage by site",
        },
    },
    globalTables: {
        globalQsIndicators: {
            ...definitions.globalQsIndicators,
            area: "campaign",
            title: (ns: Record<string, string>) => i18n.t("Global QS Indicators {{- period}}", ns),
            appendCode: "Global quality indicators",
        },
        aefiAEB: {
            elements: ["RVC_AEB", "RVC_AEFI_ALL_ANTIGENS"],
            rows: ["pe"],
            filterDataBy: ["ou"],
            disaggregatedBy: [],
            area: "site",
            title: (ns: Record<string, string>) =>
                i18n.t("AEFI and AEB indicators {{- period}}", ns),
            appendCode: "AEFI and AEB indicators", //adverseEvents
            //legendCode: "RVC_LEGEND_ZERO",
        },
    },
    tablesByAntigenAndDose: {
        coverageByAreaTable: {
            ...definitions.coverageByAgeGroupAndPeriod,
            area: "area",
            title: (ns: Record<string, string>) =>
                i18n.t(
                    "Campaign Coverage by area and dose {{- period}} (do not edit this table)",
                    ns
                ),
            appendCode: "Coverage by area and dose",
        },
        coverageByCampaignTable: {
            ...definitions.coverageByAgeGroupAndPeriod,
            area: "campaign",
            title: (ns: Record<string, string>) =>
                i18n.t(
                    "Campaign Coverage by campaign and dose {{- period}} (do not edit this table)",
                    ns
                ),
            appendCode: "Coverage by campaign and dose",
        },
    },
    tablesByAntigen: {
        coverageByAreaTotal: {
            ...definitions.administeredAndCoverageByDosesAndPeriod,
            area: "area",
            title: (ns: Record<string, string>) =>
                i18n.t("Cumulative Campaign Coverage by area (do not edit this table)", ns),
            appendCode: "Coverage by area total",
        },
        coverageByCampaignTotal: {
            ...definitions.administeredAndCoverageByDosesAndPeriod,
            area: "campaign",
            title: (ns: Record<string, string>) =>
                i18n.t("Cumulative Campaign Coverage by campaign (do not edit this table)", ns),
            appendCode: "Coverage by campaign total",
        },
        qsPerAntigen: {
            elements: ["RVC_DILUTION_SYRINGES_RATIO", "RVC_CAMPAIGN_NEEDLES_RATIO"],
            rows: ["pe", "team"],
            filterDataBy: ["ou"],
            disaggregatedBy: [],
            area: "site",
            title: (ns: Record<string, string>) => i18n.t("QS Indicators", ns),
            appendCode: "Quality indicators", //qsIndicatorsTable
        },
        vaccinesPerArea: {
            ...definitions.vaccinesPerPeriod,
            area: "area",
            title: (ns: Record<string, string>) => i18n.t("Vaccines Per Area", ns),
            appendCode: "Vaccines per area",
        },
        vaccinesPerCampaign: {
            ...definitions.vaccinesPerPeriod,
            area: "campaign",
            title: (ns: Record<string, string>) => i18n.t("Vaccines Per Campaign", ns),
            appendCode: "Vaccines per campaign",
        },
        vaccinesPerDateTeam: {
            elements: ["RVC_DOSES_ADMINISTERED", "RVC_DOSES_USED", "RVC_VACCINE_UTILIZATION"],
            rows: ["pe", "team"],
            filterDataBy: ["ou"],
            disaggregatedBy: [],
            area: "site",
            title: (ns: Record<string, string>) => i18n.t("Vaccines Per Team", ns),
            appendCode: "Vaccines per date and team", //vaccinesPerDateTeam
        },
        coverageByCampaignAgeRangeAndDose: {
            elements: ["RVC_DOSES_ADMINISTERED", "RVC_CAMPAIGN_COVERAGE"],
            rows: [],
            filterDataBy: ["pe", "ou"],
            disaggregatedBy: ["ageGroup", "doses"],
            area: "site",
            title: (ns: Record<string, string>) =>
                i18n.t("Campaign Coverage by age range and dose (do not edit this table)", ns),
            appendCode: "Coverage by age range and dose", //coverageByCampaignAgeRangeAndDose
            showRowSubTotals: false,
            showColumnTotals: false,
        },
    },
    tablesByAntigenAndSite: {
        coverageByPeriod: {
            elements: ["RVC_DOSES_ADMINISTERED", "RVC_CAMPAIGN_COVERAGE"],
            rows: ["pe"],
            filterDataBy: ["ou"],
            disaggregatedBy: ["ageGroup", "doses"],
            area: "site",
            title: (ns: Record<string, string>) =>
                i18n.t("Campaign Coverage by day (do not edit this table)", ns),
            appendCode: "Coverage by period", //coverageByPeriod
            showRowSubTotals: false,
            showColumnTotals: false,
        },
    },
};

function clipString(s: string, maxLength: number, { ellipsis = " ..." } = {}) {
    return s.length > maxLength ? s.slice(0, maxLength - ellipsis.length) + ellipsis : s;
}

export function buildDashboardItemsCode(
    datasetName: string,
    orgUnitName: string,
    antigenName: string,
    appendCode: string,
    dose: { name: string } | null = null
): string {
    const maxFieldLength = 230;
    const joiner = " - ";
    const doseName = dose ? dose.name : null;
    const suffix = _.compact([antigenName, doseName, appendCode]).join(joiner);
    // Apply clipping first to org units and finally to the full string
    const maxOrgUnitName = maxFieldLength - suffix.length - datasetName.length - 2 * joiner.length;
    const orgUnit = clipString(orgUnitName || "", maxOrgUnitName);
    const code = _.compact([datasetName, orgUnit, suffix]).join(joiner);
    return code.slice(0, maxFieldLength);
}

function getDisaggregations(
    itemConfigs: ItemConfig,
    disaggregationMetadata: DisaggregationMetadata,
    antigen: AntigenConfig | null,
    doseMetadata: DoseMetadata
): DisaggregationElement[] {
    if (!itemConfigs.disaggregatedBy) return [];

    const ageGroups = (c: ItemConfig): DisaggregationElement | null =>
        c.disaggregatedBy.includes("ageGroup") && antigen
            ? disaggregationMetadata.ageGroups(antigen, doseMetadata)
            : null;

    const teams = (c: ItemConfig): DisaggregationElement | null =>
        c.disaggregatedBy.includes("team") ? disaggregationMetadata.teams() : null;

    const doses = (c: ItemConfig): DisaggregationElement | null => {
        if (c.disaggregatedBy.includes("doses") && antigen) {
            const dosesDisaggregation = disaggregationMetadata.doses(antigen);
            if (!dosesDisaggregation) return null;
            return dosesDisaggregation.elements.length === 1 ? null : dosesDisaggregation;
        } else {
            return null;
        }
    };

    return _.compact([teams(itemConfigs), ageGroups(itemConfigs), doses(itemConfigs)]);
}

function getCharts(options: {
    campaign: Campaign;
    charts: Record<string, ItemConfig>;
    antigen: AntigenConfig | null;
    elements: Record<string, ModelDataDimensionItem[]>;
    organisationUnits: OrgUnitForVisualization[];
    itemsMetadata: ItemsMetadata;
    disaggregationMetadata: DisaggregationMetadata;
}) {
    const {
        campaign,
        charts,
        antigen,
        elements,
        organisationUnits,
        itemsMetadata,
        disaggregationMetadata,
    } = options;
    return _(charts)
        .map((chart, key) =>
            chartConstructor2({
                campaign: campaign,
                id: getUid(
                    "chart",
                    campaign.name +
                        antigen?.id +
                        chart.appendCode +
                        organisationUnits.map(ou => ou.id).join("-")
                ),
                antigen,
                data: elements[key] || [],
                type: chart.type,
                appendCode: chart.appendCode,
                organisationUnits,
                title: chart.title,
                area: chart.area,
                rows: chart.rows,
                filterDataBy: chart.filterDataBy,
                ...itemsMetadata,
                disaggregations: getDisaggregations(chart, disaggregationMetadata, antigen, null),
            })
        )
        .compact()
        .value();
}

function getTables(options: {
    campaign: Campaign;
    tables: Record<string, ItemConfig>;
    antigen: AntigenConfig | null;
    elements: Record<string, ModelDataDimensionItem[]>;
    organisationUnits: OrgUnitForVisualization[];
    itemsMetadata: ItemsMetadata;
    disaggregationMetadata: DisaggregationMetadata;
    legendsMetadata: LegendsMetadata;
    doseMetadata?: DoseMetadata;
}) {
    const {
        campaign,
        tables,
        antigen,
        elements,
        organisationUnits,
        itemsMetadata,
        disaggregationMetadata,
        legendsMetadata,
        doseMetadata = null,
    } = options;
    return _(tables)
        .map((c: ItemConfig, key: string) => {
            const teamMetadata = disaggregationMetadata.teams();
            const rows = c.rows.map(row => (row === "team" ? teamMetadata.categoryId : row));
            const teamRowRawDimension = _.some(c.rows, r => r === "team") ? teamMetadata : null;
            const legendId = c.legendCode ? legendsMetadata.get(c.legendCode) : null;

            return tableConstructor2({
                campaign: campaign,
                id: getUid(
                    "table",
                    campaign.name +
                        antigen?.id +
                        c.appendCode +
                        organisationUnits.map(ou => ou.id).join("-") +
                        doseMetadata?.doseId
                ),
                antigen,
                data: elements[key] || [],
                appendCode: c.appendCode,
                rows,
                filterDataBy: c.filterDataBy,
                organisationUnits,
                title: c.title,
                area: c.area,
                legendId,
                teamRowRawDimension,
                ...itemsMetadata,
                disaggregations: getDisaggregations(
                    c,
                    disaggregationMetadata,
                    antigen,
                    doseMetadata
                ),
                showRowSubTotals: c.showRowSubTotals,
                showColumnSubTotals: !!c.showColumnSubTotals,
                showColumnTotals: _.isUndefined(c.showColumnTotals) ? true : c.showColumnTotals,
                dose: doseMetadata,
            });
        })
        .compact()
        .value();
}

function tableConstructor2(options: any) {
    return tableConstructor({ ...options, ...processDisaggregations(options) });
}

function chartConstructor2(options: any) {
    return chartConstructor({ ...options, ...processDisaggregations(options) });
}

export function buildDashboardItems(
    campaign: Campaign,
    antigensMeta: AntigenConfig[],
    datasetName: string,
    organisationUnitsMetadata: OrgUnitForVisualization[],
    periodItems: PeriodItem[],
    antigenCategory: string,
    disaggregationMetadata: DisaggregationMetadata,
    elements: Record<string, ModelDataDimensionItem[]>,
    legendsMetadata: LegendsMetadata
) {
    const itemsMetadata = {
        datasetName,
        periodItems,
        antigenCategory,
    };

    const {
        globalTables: globalTablesMetadata,
        tablesByAntigen: tablesByAntigenMetadata,
        tablesByAntigenAndSite: tablesByAntigenAndSiteMetadata,
        tablesByAntigenAndDose: tablesByAntigenAndDoseMetadata,
        chartsByAntigen: chartsByAntigenMetadata,
    } = dashboardItemsConfig;

    const qsPerAntigen2 = tablesByAntigenMetadata["qsPerAntigen"] as ItemConfig;
    const tablesByAntigen = _(antigensMeta)
        .flatMap(antigen => {
            tablesByAntigenMetadata["qsPerAntigen"] = qsPerAntigen2;
            if (antigenNoDiluted(antigen)) {
                delete (tablesByAntigenMetadata as Record<string, ItemConfig | undefined>)[
                    "qsPerAntigen"
                ];
            }

            return getTables({
                campaign: campaign,
                tables: tablesByAntigenMetadata,
                antigen,
                elements,
                organisationUnits: organisationUnitsMetadata,
                itemsMetadata,
                disaggregationMetadata,
                legendsMetadata,
            });
        })
        .value();

    const tablesByAntigenAndSite = _(antigensMeta)
        .flatMap(antigen =>
            organisationUnitsMetadata.map(ou =>
                getTables({
                    campaign: campaign,
                    tables: tablesByAntigenAndSiteMetadata,
                    antigen,
                    elements,
                    organisationUnits: [ou],
                    itemsMetadata,
                    disaggregationMetadata,
                    legendsMetadata,
                })
            )
        )
        .flatten()
        .value();

    const tablesByAntigenAndDose = _(antigensMeta)
        .flatMap(antigen => {
            const doses = disaggregationMetadata.doses(antigen);
            if (!doses)
                return getTables({
                    campaign: campaign,
                    tables: tablesByAntigenAndDoseMetadata,
                    antigen,
                    elements,
                    organisationUnits: organisationUnitsMetadata,
                    itemsMetadata,
                    disaggregationMetadata,
                    legendsMetadata,
                });
            const dosesCategoryId = doses.categoryId;
            const dosesForTables = doses.elements.map(d => ({
                categoryId: dosesCategoryId,
                doseId: d.id,
                name: d.name,
            }));
            return _.flatMap(dosesForTables, dft =>
                getTables({
                    campaign: campaign,
                    tables: tablesByAntigenAndDoseMetadata,
                    antigen,
                    elements,
                    organisationUnits: organisationUnitsMetadata,
                    itemsMetadata,
                    disaggregationMetadata,
                    legendsMetadata,
                    doseMetadata: dosesForTables.length > 1 ? dft : null,
                })
            );
        })
        .value();

    const globalTables = getTables({
        campaign: campaign,
        tables: globalTablesMetadata,
        antigen: null,
        elements,
        organisationUnits: organisationUnitsMetadata,
        itemsMetadata,
        disaggregationMetadata,
        legendsMetadata,
    });

    const reportTables = _.concat(
        globalTables,
        tablesByAntigenAndDose,
        tablesByAntigen,
        tablesByAntigenAndSite
    );

    const chartsByAntigen = _(antigensMeta)
        .flatMap(antigen =>
            getCharts({
                campaign: campaign,
                charts: chartsByAntigenMetadata,
                antigen,
                elements,
                organisationUnits: organisationUnitsMetadata,
                itemsMetadata,
                disaggregationMetadata,
            })
        )
        .value();

    return { charts: chartsByAntigen, reportTables };
}

const dataMapper = (
    elementsMetadata: ElementsMetadataEntry[],
    filterList: string[]
): DataDimensionItem[] =>
    _(elementsMetadata)
        .map(dataList => {
            return dataList.data
                .filter(({ code }) => _.includes(filterList, code))
                .map(({ id, code }) => ({
                    dataDimensionItemType: dataList.type,
                    [dataList.key]: { id, code },
                }));
        })
        .flatten()
        .value();

export function itemsMetadataConstructor(dashboardItemsMetadata: {
    elementsMetadata: ElementsMetadataEntry[];
    antigenCategory: string;
    disaggregationMetadata: DisaggregationMetadata;
}) {
    const { elementsMetadata, antigenCategory, disaggregationMetadata } = dashboardItemsMetadata;

    const {
        globalTables,
        tablesByAntigen,
        tablesByAntigenAndSite,
        tablesByAntigenAndDose,
        chartsByAntigen,
    } = dashboardItemsConfig;

    const allTables = {
        ...globalTables,
        ...tablesByAntigen,
        ...tablesByAntigenAndSite,
        ...tablesByAntigenAndDose,
    };

    const tableElements = _(allTables)
        .map((item: ItemConfig, key: string) => [key, dataMapper(elementsMetadata, item.elements)])
        .fromPairs()
        .value();

    const chartElements = _(chartsByAntigen)
        .map((item, key) => [key, dataMapper(elementsMetadata, item.elements)])
        .fromPairs()
        .value();

    const dashboardItemsElements = {
        antigenCategory,
        disaggregationMetadata,
        ...tableElements,
        ...chartElements,
    };
    return dashboardItemsElements;
}

function antigenNoDiluted(antigen: AntigenConfig): boolean {
    return (
        antigen.code === "RVC_ANTIGEN_ROTAVIRUS" ||
        antigen.code === "RVC_ANTIGEN_PCV" ||
        antigen.code === "RVC_ANTIGEN_PERTPENTA" ||
        antigen.code === "RVC_ANTIGEN_CHOLERA" ||
        antigen.code === "RVC_ANTIGEN_POLIO_ORAL"
    );
}
function getDimensions(
    disaggregations: DisaggregationElement[],
    antigen: AntigenConfig | null,
    antigenCategory: string
) {
    const antigenCategoryDimension = antigen
        ? {
              category: { id: antigenCategory },
              categoryOptions: [{ id: antigen.id }],
          }
        : {};

    const noDisaggregationDimension = {
        categoryDimensions: antigenCategoryDimension,
        columns: { id: "dx" },
        columnDimensions: "dx",
    };

    if (_.isEmpty(disaggregations)) return _.mapValues(noDisaggregationDimension, dis => [dis]);

    const disaggregationDimensions = disaggregations.map(d => ({
        categoryDimensions: {
            category: {
                id: d.categoryId,
            },
            categoryOptions: d.elements.map(e => ({ id: e })),
        },
        columns: { id: d.categoryId },
        columnDimensions: d.categoryId,
    }));

    const keys = ["categoryDimensions", "columns", "columnDimensions"];

    const allDimensions: Record<string, any>[] = [
        noDisaggregationDimension,
        ...disaggregationDimensions,
    ];

    const values = keys.map(key => allDimensions.map(o => o[key]));
    return _.zipObject(keys, values);
}

function getTitleWithTranslations(fn: TitleFn, baseNamespace: Record<string, string>) {
    const locales = Object.keys(i18n.store.data);
    const title = fn(baseNamespace);
    const translations = locales.map(locale => ({
        property: "SHORT_NAME",
        locale,
        value: fn({ ...baseNamespace, lng: locale }),
    }));
    return { title, translations };
}

const chartConstructor = ({
    id,
    datasetName,
    antigen,
    periodItems,
    antigenCategory,
    data,
    type,
    appendCode,
    organisationUnits,
    disaggregations,
    area,
    rows,
    filterDataBy,
    title,
}: ConstructorOptions) => {
    const dimensions = getDimensions(disaggregations, antigen, antigenCategory);
    const categoryDimensions = dimensions.categoryDimensions || [];
    const allColumns = dimensions.columns || [];

    const firstPeriod = assert(periodItems[0], "No period items");
    const lastPeriod = assert(_.last(periodItems), "No period items");
    const periodForTitle = `${moment.utc(firstPeriod.id).format("DD/MM/YYYY")} - ${moment
        .utc(lastPeriod.id)
        .format("DD/MM/YYYY")}`;

    const columns = _.isEmpty(disaggregations)
        ? allColumns
        : allColumns.filter((c: any) => c.id !== "dx");

    const filterDimensions = _.compact([...filterDataBy, _.isEmpty(disaggregations) ? null : "dx"]);

    let organisationUnitNames;

    if (organisationUnits.length > 1) {
        organisationUnitNames = "";
    } else {
        organisationUnitNames = organisationUnits.map(ou => ou.name).join("-");
    }
    const organisationUnitElements = getOrganisationUnitElements(organisationUnits, area);
    if (organisationUnitElements.length === 0) return null;

    return {
        id,
        name: buildDashboardItemsCode(
            datasetName,
            organisationUnitNames,
            antigen?.name ?? "Global",
            appendCode
        ),
        showData: true,
        userOrganisationUnitChildren: false,
        type,
        subscribed: false,
        parentGraphMap: {},
        userOrganisationUnit: false,
        regressionType: "NONE",
        completedOnly: false,
        cumulativeValues: false,
        sortOrder: 0,
        favorite: false,
        topLimit: 0,
        ...getTitleWithTranslations(title, { period: periodForTitle }),
        hideEmptyRowItems: "AFTER_LAST",
        aggregationType: "DEFAULT",
        userOrganisationUnitGrandChildren: false,
        displayName: buildDashboardItemsCode(
            datasetName,
            organisationUnitNames,
            antigen?.name ?? "Global",
            appendCode
        ),
        hideSubtitle: true,
        hideLegend: false,
        externalAccess: false,
        percentStackedValues: false,
        noSpaceBetweenColumns: false,
        hideTitle: false,
        access: {
            read: true,
            update: true,
            externalize: true,
            delete: true,
            write: true,
            manage: true,
        },
        relativePeriods: {
            thisYear: false,
            quartersLastYear: false,
            last52Weeks: false,
            thisWeek: false,
            lastMonth: false,
            last14Days: false,
            biMonthsThisYear: false,
            monthsThisYear: false,
            last2SixMonths: false,
            yesterday: false,
            thisQuarter: false,
            last12Months: false,
            last5FinancialYears: false,
            thisSixMonth: false,
            lastQuarter: false,
            thisFinancialYear: false,
            last4Weeks: false,
            last3Months: false,
            thisDay: false,
            thisMonth: false,
            last5Years: false,
            last6BiMonths: false,
            last4BiWeeks: false,
            lastFinancialYear: false,
            lastBiWeek: false,
            weeksThisYear: false,
            last6Months: false,
            last3Days: false,
            quartersThisYear: false,
            monthsLastYear: false,
            lastWeek: false,
            last7Days: false,
            thisBimonth: false,
            lastBimonth: false,
            lastSixMonth: false,
            thisBiWeek: false,
            lastYear: false,
            last12Weeks: false,
            last4Quarters: false,
        },
        dataElementGroupSetDimensions: [],
        attributeDimensions: [],
        filterDimensions,
        interpretations: [],
        itemOrganisationUnitGroups: [],
        userGroupAccesses: [],
        programIndicatorDimensions: [],
        subscribers: [],
        attributeValues: [],
        userAccesses: [],
        favorites: [],
        dataDimensionItems: data,
        categoryOptionGroupSetDimensions: [],
        columns,
        organisationUnitGroupSetDimensions: [],
        organisationUnitLevels: [],
        dataElementDimensions: [],
        periods: periodItems,
        organisationUnits: _.uniqBy(organisationUnitElements, ou => ou.id),
        categoryDimensions,
        filters: filterDimensions.map(fd => ({ id: fd })),
        rows: rows.map(r => ({ id: r })),
        colSubTotals: false,
        colTotals: false,
        columnDimensions: columns.map((column: any) => column.id),
        digitGroupSeparator: "SPACE",
        displayDensity: "NORMAL",
        fixColumnHeaders: false,
        fixRowHeaders: false,
        fontSize: "NORMAL",
        hideEmptyColumns: false,
        hideEmptyRows: true,
        legend: { showKey: false },
        optionalAxes: [],
        regression: false,
        reportingParams: {
            grandParentOrganisationUnit: false,
            organisationUnit: false,
            parentOrganisationUnit: false,
            reportingPeriod: false,
        },
        rowDimensions: rows,
        rowSubTotals: false,
        rowTotals: false,
        seriesKey: { hidden: false },
        showDimensionLabels: false,
        showHierarchy: false,
        skipRounding: false,
    };
};

const pathRightOffsetByType = {
    site: 0,
    area: 1,
    campaign: 2,
};

const levels = {
    campaign: 4,
    area: 5,
    site: 6,
};

function getOrganisationUnitElements(
    organisationUnits: OrgUnitForVisualization[],
    area: AreaType
): Ref[] {
    const pathRightOffset = pathRightOffsetByType[area] || 0;

    return _(organisationUnits)
        .map(orgUnit => {
            const path_ids = (orgUnit.parents[orgUnit.id] || "").split("/");
            const level = path_ids.length - 1 - pathRightOffset;
            const visualizationOrgUnitId = path_ids[level];
            // Problem: Old campaigns had orgUnits at level 5, so when generating visualizations for
            // "campaign" area, the final orgUnit will be at level 3, which makes no sense.
            // Action: Skip these orgUnits.
            return level < levels.campaign ? null : visualizationOrgUnitId;
        })
        .compact()
        .uniq()
        .map(orgUnitId => ({ id: orgUnitId }))
        .value();
}

const tableConstructor = ({
    id,
    datasetName,
    antigen,
    periodItems,
    antigenCategory,
    data,
    appendCode,
    organisationUnits,
    disaggregations,
    rows,
    filterDataBy,
    area,
    title,
    teamRowRawDimension = null,
    showRowSubTotals = true,
    showColumnTotals = true,
    showColumnSubTotals = false,
    dose = null,
}: ConstructorOptions & {
    teamRowRawDimension?: DisaggregationElement | null;
    showRowSubTotals?: boolean;
    showColumnTotals?: boolean;
    showColumnSubTotals?: boolean;
    dose?: DoseMetadata;
}) => {
    const dimensions = getDimensions(disaggregations, antigen, antigenCategory);
    const columns = dimensions.columns || [];
    const columnDimensions = dimensions.columnDimensions || [];
    const categoryDimensions = dimensions.categoryDimensions || [];
    const firstPeriod = assert(periodItems[0], "No period items");
    const lastPeriod = assert(_.last(periodItems), "No period items");
    const periodForTitle = `${moment.utc(firstPeriod.id).format("DD/MM/YYYY")} - ${moment
        .utc(lastPeriod.id)
        .format("DD/MM/YYYY")}`;

    const categoryDimensionsWithTeams = teamRowRawDimension
        ? [
              ...categoryDimensions,
              {
                  category: { id: teamRowRawDimension.categoryId },
                  categoryOptions: teamRowRawDimension.elements.map(co => ({ id: co })),
              },
          ]
        : categoryDimensions;

    const categoryDimensionsComplete = dose
        ? [
              ...categoryDimensionsWithTeams,
              {
                  category: { id: dose.categoryId },
                  categoryOptions: [
                      {
                          id: dose.doseId,
                      },
                  ],
              },
          ]
        : categoryDimensionsWithTeams;

    let organisationUnitNames;
    if (organisationUnits.length > 1) {
        organisationUnitNames = "";
    } else {
        organisationUnitNames = organisationUnits.map(ou => ou.name).join("-");
    }
    // Converts selected OrganisationUnits into their parents (Sites => Areas)
    const organisationUnitElements = getOrganisationUnitElements(organisationUnits, area);
    if (organisationUnitElements.length === 0) return null;

    const subName = antigen ? antigen.name : "Global";
    const filters = filterDataBy.map(f => ({ id: f }));
    const allFilters = _.compact(filters);

    return {
        id,
        type: "PIVOT_TABLE",
        name: buildDashboardItemsCode(
            datasetName,
            organisationUnitNames,
            subName,
            appendCode,
            dose
        ),
        numberType: "VALUE",
        userOrganisationUnitChildren: false,
        hideEmptyColumns: false,
        subscribed: false,
        hideEmptyRows: true,
        parentGraphMap: {},
        userOrganisationUnit: false,
        rowSubTotals: showRowSubTotals && !_.isEmpty(disaggregations),
        displayDensity: "NORMAL",
        completedOnly: false,
        colTotals: showColumnTotals,
        showDimensionLabels: true,
        sortOrder: 0,
        fontSize: "NORMAL",
        favorite: false,
        topLimit: 0,
        aggregationType: "DEFAULT",
        userOrganisationUnitGrandChildren: false,
        displayName: buildDashboardItemsCode(
            datasetName,
            organisationUnitNames,
            subName,
            appendCode,
            dose
        ),
        hideSubtitle: true,
        //...getTitleWithTranslations(title, {}),
        ...getTitleWithTranslations(title, { period: periodForTitle }),
        externalAccess: false,
        colSubTotals: showColumnSubTotals,
        //legendSet: legendId ? { id: legendId } : null,
        showHierarchy: false,
        rowTotals: false,
        cumulativeValues: false,
        digitGroupSeparator: "NONE",
        hideTitle: false,
        regression: false,
        skipRounding: false,
        reportingParams: {
            grandParentOrganisationUnit: false,
            organisationUnit: false,
            parentOrganisationUnit: false,
            reportingPeriod: false,
        },
        access: {
            read: true,
            update: true,
            externalize: true,
            delete: true,
            write: true,
            manage: true,
        },
        relativePeriods: {
            thisYear: false,
            quartersLastYear: false,
            last52Weeks: false,
            thisWeek: false,
            lastMonth: false,
            last14Days: false,
            biMonthsThisYear: false,
            monthsThisYear: false,
            last2SixMonths: false,
            yesterday: false,
            thisQuarter: false,
            last12Months: false,
            last5FinancialYears: false,
            thisSixMonth: false,
            lastQuarter: false,
            thisFinancialYear: false,
            last4Weeks: false,
            last3Months: false,
            thisDay: false,
            thisMonth: false,
            last5Years: false,
            last6BiMonths: false,
            last4BiWeeks: false,
            lastFinancialYear: false,
            lastBiWeek: false,
            weeksThisYear: false,
            last6Months: false,
            last3Days: false,
            quartersThisYear: false,
            monthsLastYear: false,
            lastWeek: false,
            last7Days: false,
            thisBimonth: false,
            lastBimonth: false,
            lastSixMonth: false,
            thisBiWeek: false,
            lastYear: false,
            last12Weeks: false,
            last4Quarters: false,
        },
        dataElementGroupSetDimensions: [],
        attributeDimensions: [],
        filterDimensions: _.compact(filterDataBy),
        interpretations: [],
        itemOrganisationUnitGroups: [],
        userGroupAccesses: [],
        programIndicatorDimensions: [],
        subscribers: [],
        attributeValues: [],
        columnDimensions,
        userAccesses: [],
        favorites: [],
        dataDimensionItems: data,
        categoryOptionGroupSetDimensions: [],
        columns,
        organisationUnitGroupSetDimensions: [],
        organisationUnitLevels: [],
        dataElementDimensions: [],
        periods: periodItems,
        organisationUnits: _.uniqBy(organisationUnitElements, ou => ou.id),
        categoryDimensions: categoryDimensionsComplete,
        filters: allFilters,
        rows: rows.map(r => ({ id: r })),
        rowDimensions: rows,
        fixColumnHeaders: false,
        fixRowHeaders: false,
        hideLegend: false,
        legend: {
            showKey: false,
            strategy: "FIXED",
            style: "FILL",
        },
        noSpaceBetweenColumns: false,
        optionalAxes: [],
        percentStackedValues: false,
        seriesKey: { hidden: false },
        showData: false,
        yearlySeries: [],
    };
};
