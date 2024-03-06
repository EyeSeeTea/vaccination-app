import _ from "lodash";
import { generateUid } from "d2/uid";
import moment from "moment";
import i18n from "@dhis2/d2-i18n";

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

export const dashboardItemsConfig = {
    metadataToFetch: {
        INDICATOR: [
            "RVC_ADS_WASTAGE",
            "RVC_DILUTION_SYRINGES_RATIO",
            "RVC_SAFETY_BOXES",
            "RVC_CAMPAIGN_COVERAGE",
            "RVC_VACCINE_UTILIZATION",
            "RVC_CAMPAIGN_NEEDLES_RATIO",
        ],
        DATA_ELEMENT: ["RVC_AEB", "RVC_AEFI", "RVC_DOSES_ADMINISTERED", "RVC_DOSES_USED"],
    },
    chartsByAntigen: {
        coverageBySite: {
            ...definitions.coverageByDosesAndPeriod,
            area: "site",
            title: ns => i18n.t("Coverage by Site {{- period}} (do not edit this chart)", ns),
            appendCode: "Coverage by site",
        },
        coverageByArea: {
            ...definitions.coverageByDosesAndPeriod,
            area: "area",
            title: ns => i18n.t("Coverage by Area {{- period}} (do not edit this chart)", ns),
            appendCode: "Coverage by area",
        },
        coverageByCampaign: {
            ...definitions.coverageByDosesAndPeriod,
            area: "campaign",
            title: ns => i18n.t("Coverage by Campaign {{- period}} (do not edit this chart)", ns),
            appendCode: "Coverage by campaign",
        },
    },
    globalTables: {
        globalQsIndicators: {
            ...definitions.globalQsIndicators,
            area: "campaign",
            title: ns => i18n.t("Global QS Indicators {{- period}}", ns),
            appendCode: "Global quality indicators",
        },
        aefiAEB: {
            elements: ["RVC_AEB", "RVC_AEFI"],
            rows: ["pe"],
            filterDataBy: ["ou"],
            disaggregatedBy: [],
            area: "site",
            title: ns => i18n.t("AEFI and AEB indicators {{- period}}", ns),
            appendCode: "AEFI and AEB indicators", //adverseEvents
            //legendCode: "RVC_LEGEND_ZERO",
        },
    },
    tablesByAntigenAndDose: {
        coverageByAreaTable: {
            ...definitions.coverageByAgeGroupAndPeriod,
            area: "area",
            title: ns =>
                i18n.t(
                    "Campaign Coverage by area and dose {{- period}} (do not edit this table)",
                    ns
                ),
            appendCode: "Coverage by area and dose",
        },
        coverageByCampaignTable: {
            ...definitions.coverageByAgeGroupAndPeriod,
            area: "campaign",
            title: ns =>
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
            title: ns =>
                i18n.t("Cumulative Campaign Coverage by area (do not edit this table)", ns),
            appendCode: "Coverage by area total",
        },
        coverageByCampaignTotal: {
            ...definitions.administeredAndCoverageByDosesAndPeriod,
            area: "campaign",
            title: ns =>
                i18n.t("Cumulative Campaign Coverage by campaign (do not edit this table)", ns),
            appendCode: "Coverage by campaign total",
        },
        qsPerAntigen: {
            elements: ["RVC_DILUTION_SYRINGES_RATIO", "RVC_CAMPAIGN_NEEDLES_RATIO"],
            rows: ["pe", "team"],
            filterDataBy: ["ou"],
            disaggregatedBy: [],
            area: "site",
            title: ns => i18n.t("QS Indicators", ns),
            appendCode: "Quality indicators", //qsIndicatorsTable
        },
        vaccinesPerArea: {
            ...definitions.vaccinesPerPeriod,
            area: "area",
            title: ns => i18n.t("Vaccines Per Area", ns),
            appendCode: "Vaccines per area",
        },
        vaccinesPerCampaign: {
            ...definitions.vaccinesPerPeriod,
            area: "campaign",
            title: ns => i18n.t("Vaccines Per Campaign", ns),
            appendCode: "Vaccines per campaign",
        },
        vaccinesPerDateTeam: {
            elements: ["RVC_DOSES_ADMINISTERED", "RVC_DOSES_USED", "RVC_VACCINE_UTILIZATION"],
            rows: ["pe", "team"],
            filterDataBy: ["ou"],
            disaggregatedBy: [],
            area: "site",
            title: ns => i18n.t("Vaccines Per Team", ns),
            appendCode: "Vaccines per date and team", //vaccinesPerDateTeam
        },
        coverageByCampaignAgeRangeAndDose: {
            elements: ["RVC_DOSES_ADMINISTERED", "RVC_CAMPAIGN_COVERAGE"],
            rows: [],
            filterDataBy: ["pe", "ou"],
            disaggregatedBy: ["ageGroup", "doses"],
            area: "site",
            title: ns =>
                i18n.t("Campaign Coverage by age range and dose (do not edit this table)", ns),
            appendCode: "Coverage by age range and dose ", //coverageByCampaignAgeRangeAndDose
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
            title: ns => i18n.t("Campaign Coverage by day (do not edit this table)", ns),
            appendCode: "Coverage by period", //coverageByPeriod
            showRowSubTotals: false,
            showColumnTotals: false,
        },
    },
};

function clipString(s, maxLength, { ellipsis = " ..." } = {}) {
    return s.length > maxLength ? s.slice(0, maxLength - ellipsis.length) + ellipsis : s;
}

export function buildDashboardItemsCode(
    datasetName,
    orgUnitName,
    antigenName,
    appendCode,
    dose = null
) {
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

function getDisaggregations(itemConfigs, disaggregationMetadata, antigen) {
    if (!itemConfigs.disaggregatedBy) return [];

    const ageGroups = c =>
        c.disaggregatedBy.includes("ageGroup") && antigen
            ? disaggregationMetadata.ageGroups(antigen)
            : null;

    const teams = c => (c.disaggregatedBy.includes("team") ? disaggregationMetadata.teams() : null);

    const doses = c => {
        if (c.disaggregatedBy.includes("doses") && antigen) {
            const dosesDisaggregation = disaggregationMetadata.doses(antigen);
            return dosesDisaggregation.elements.length === 1 ? null : dosesDisaggregation;
        } else {
            return null;
        }
    };

    return _.compact([teams(itemConfigs), ageGroups(itemConfigs), doses(itemConfigs)]);
}

function getCharts({
    charts,
    antigen,
    elements,
    organisationUnits,
    itemsMetadata,
    disaggregationMetadata,
}) {
    return _(charts)
        .map((chart, key) =>
            chartConstructor({
                id: generateUid(),
                antigen,
                data: elements[key],
                type: chart.type,
                appendCode: chart.appendCode,
                organisationUnits,
                title: chart.title,
                area: chart.area,
                rows: chart.rows,
                filterDataBy: chart.filterDataBy,
                ...itemsMetadata,
                disaggregations: getDisaggregations(chart, disaggregationMetadata, antigen),
            })
        )
        .value();
}

function getTables({
    tables,
    antigen,
    elements,
    organisationUnits,
    itemsMetadata,
    disaggregationMetadata,
    legendsMetadata,
    doseMetadata,
}) {
    return _(tables)
        .pickBy()
        .map((c, key) => {
            const teamMetadata = disaggregationMetadata.teams();
            const rows = c.rows.map(row => (row === "team" ? teamMetadata.categoryId : row));
            const teamRowRawDimension = _.some(c.rows, r => r === "team") ? teamMetadata : null;
            const legendId = c.legendCode ? legendsMetadata.get(c.legendCode) : null;

            return tableConstructor({
                id: generateUid(),
                antigen,
                data: elements[key],
                appendCode: c.appendCode,
                rows,
                filterDataBy: c.filterDataBy,
                organisationUnits,
                title: c.title,
                area: c.area,
                legendId,
                teamRowRawDimension,
                ...itemsMetadata,
                disaggregations: getDisaggregations(c, disaggregationMetadata, antigen),
                showRowSubTotals: c.showRowSubTotals,
                showColumnSubTotals: !!c.showColumnSubTotals,
                showColumnTotals: _.isUndefined(c.showColumnTotals) ? true : c.showColumnTotals,
                dose: doseMetadata,
            });
        })
        .value();
}

export function buildDashboardItems(
    antigensMeta,
    datasetName,
    organisationUnitsMetadata,
    periodItems,
    antigenCategory,
    disaggregationMetadata,
    elements,
    legendsMetadata
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

    var qsPerAntigen2 = tablesByAntigenMetadata["qsPerAntigen"];
    const tablesByAntigen = _(antigensMeta)
        .flatMap(antigen => {
            tablesByAntigenMetadata["qsPerAntigen"] = qsPerAntigen2;
            if (antigenNoDiluted(antigen)) {
                delete tablesByAntigenMetadata["qsPerAntigen"];
            }

            return getTables({
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

const dataMapper = (elementsMetadata, filterList) =>
    _(elementsMetadata)
        .map(dataList => {
            return dataList.data
                .filter(({ code }) => _.includes(filterList, code))
                .map(({ id }) => ({
                    dataDimensionItemType: dataList.type,
                    [dataList.key]: { id },
                }));
        })
        .flatten()
        .value();

export function itemsMetadataConstructor(dashboardItemsMetadata) {
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
        .pickBy()
        .map((item, key) => [key, dataMapper(elementsMetadata, item.elements)])
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

function antigenNoDiluted(antigen) {
    if (
        antigen.code === "RVC_ANTIGEN_ROTAVIRUS" ||
        antigen.code === "RVC_ANTIGEN_PCV" ||
        antigen.code === "RVC_ANTIGEN_PERTPENTA" ||
        antigen.code === "RVC_ANTIGEN_CHOLERA" ||
        antigen.code === "RVC_ANTIGEN_POLIO_ORAL"
    ) {
        return true;
    }
}
function getDimensions(disaggregations, antigen, antigenCategory) {
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

    const allDimensions = [noDisaggregationDimension, ...disaggregationDimensions];

    return _(keys)
        .zip(keys.map(key => allDimensions.map(o => o[key])))
        .fromPairs()
        .value();
}

function getTitleWithTranslations(fn, baseNamespace) {
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
    area = false,
    rows,
    filterDataBy,
    title,
}) => {
    const { categoryDimensions, columns: allColumns } = getDimensions(
        disaggregations,
        antigen,
        antigenCategory
    );

    const periodForTitle = `${moment(periodItems[0].id).format("DD/MM/YYYY")} - ${moment(
        _.last(periodItems).id
    ).format("DD/MM/YYYY")}`;

    const columns = _.isEmpty(disaggregations) ? allColumns : allColumns.filter(c => c.id !== "dx");

    const filterDimensions = _.compact([
        ...filterDataBy,
        antigenCategory,
        _.isEmpty(disaggregations) ? null : "dx",
    ]);

    let organisationUnitNames;

    if (organisationUnits.length > 1) {
        organisationUnitNames = "";
    } else {
        organisationUnitNames = organisationUnits.map(ou => ou.name).join("-");
    }
    const organisationUnitElements = getOrganisationUnitElements(organisationUnits, area);

    return {
        id,
        name: buildDashboardItemsCode(datasetName, organisationUnitNames, antigen.name, appendCode),
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
            antigen.name,
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
        organisationUnits: organisationUnitElements,
        categoryDimensions,
        filters: filterDimensions.map(fd => ({ id: fd })),
        rows: rows.map(r => ({ id: r })),
        colSubTotals: false,
        colTotals: false,
        columnDimensions: columns.map(column => column.id),
        digitGroupSeparator: "SPACE",
        displayDensity: "NORMAL",
        fixColumnHeaders: false,
        fixRowHeaders: false,
        fontSize: "NORMAL",
        hideEmptyColumns: false,
        hideEmptyRows: false,
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

function getOrganisationUnitElements(organisationUnits, area) {
    const pathRightOffset = pathRightOffsetByType[area] || 0;

    return _(organisationUnits)
        .map(orgUnit => {
            const path_ids = orgUnit.parents[orgUnit.id].split("/");
            return path_ids[path_ids.length - 1 - pathRightOffset];
        })
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
    //  legendId,
    teamRowRawDimension = null,
    showRowSubTotals = true,
    showColumnTotals = true,
    showColumnSubTotals = false,
    dose = null,
}) => {
    const { columns, columnDimensions, categoryDimensions } = getDimensions(
        disaggregations,
        antigen,
        antigenCategory
    );
    const periodForTitle = `${moment(periodItems[0].id).format("DD/MM/YYYY")} - ${moment(
        _.last(periodItems).id
    ).format("DD/MM/YYYY")}`;

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

    const subName = antigen ? antigen.name : "Global";
    const filters = filterDataBy.map(f => ({ id: f }));
    const allFilters = _.compact([
        ...filters,
        dose ? { id: dose.categoryId } : null,
        antigen ? { id: antigenCategory } : null,
    ]);

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
        hideEmptyRows: false,
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
        filterDimensions: _.compact([
            ...filterDataBy,
            antigen ? antigenCategory : null,
            dose ? dose.categoryId : null,
        ]),
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
        organisationUnits: organisationUnitElements,
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
