import _ from "lodash";

export const dashboardItemsConfig = {
    appendCodes: {
        indicatorChart: "indicatorChart",
        qsIndicatorsTable: "qsTable",
        vaccinesTable: "vTable",
        utilizationRateChart: "utilzationRateChart",
    },
    categoryCode: "RVC_ANTIGEN",
    tablesDataCodes: {
        vaccinesTable: ["RVC_DOSES_ADMINISTERED", "RVC_DOSES_USED"],
        qsIndicatorsTable: [
            "RVC_ADS_USED",
            "RVC_SYRINGES",
            "RVC_SAFETY_BOXES",
            "RVC_NEEDLES",
            "RVC_AEB",
        ],
    },
    chartsDataCodes: {
        indicatorChart: ["RVC_SAFETY_BOXES", "RVC_ADS_WASTAGE", "RVC_DILUTION_SYRINGES_RATIO"],
        utilizationRateChart: ["RVC_VACCINE_UTILITZATION"],
    },
};

export function buildDashboardItems(
    antigensMeta,
    name,
    datasetId,
    organisationUnitsIds,
    organizationUnitsParents,
    period,
    antigenCategory,
    elements
) {
    const { appendCodes } = dashboardItemsConfig;
    const charts = antigensMeta.map(antigen => [
        chartConstructor(
            name,
            antigen,
            datasetId,
            organisationUnitsIds,
            organizationUnitsParents,
            period,
            antigenCategory,
            elements.indicatorChart,
            "COLUMN",
            appendCodes.indicatorChart
        ),
        chartConstructor(
            name,
            antigen,
            datasetId,
            organisationUnitsIds,
            organizationUnitsParents,
            period,
            antigenCategory,
            elements.utilizationRateChart,
            "LINE",
            appendCodes.utilizationRateChart
        ),
    ]);
    const tables = antigensMeta.map(antigen => [
        tableConstructor(
            name,
            antigen,
            datasetId,
            organisationUnitsIds,
            period,
            antigenCategory,
            elements.qsTable,
            appendCodes.qsIndicatorsTable
        ),
        tableConstructor(
            name,
            antigen,
            datasetId,
            organisationUnitsIds,
            period,
            antigenCategory,
            elements.vaccineTable,
            appendCodes.vaccinesTable
        ),
    ]);
    return { charts: _.flatten(charts), reportTables: _.flatten(tables) };
}

const dataMapper = (dataList, filterList) =>
    dataList.data.filter(({ code }) => _.includes(filterList, code)).map(({ id }) => ({
        dataDimensionItemType: dataList.type,
        [dataList.key]: { id },
    }));

export function itemsMetadataConstructor(dashboardItemsMetadata) {
    const { dataElements, indicators, antigenCategory } = dashboardItemsMetadata;
    const {
        tablesDataCodes: { vaccinesTable, qsIndicatorsTable },
        chartsDataCodes: { indicatorChart, utilizationRateChart },
    } = dashboardItemsConfig;

    const vaccineTableDE = dataMapper(dataElements, vaccinesTable);
    const qsTableDE = dataMapper(dataElements, qsIndicatorsTable);
    const indicatorChartInd = dataMapper(indicators, indicatorChart);
    const utilizationRateChartInd = dataMapper(indicators, utilizationRateChart);

    const dashboardItemsElements = {
        antigenCategory,
        vaccineTable: vaccineTableDE,
        qsTable: qsTableDE,
        indicatorChart: indicatorChartInd,
        utilizationRateChart: utilizationRateChartInd,
    };
    return dashboardItemsElements;
}

const chartConstructor = (
    name,
    antigen,
    datasetId,
    organisationUnitsIds,
    organisationUnitsParents,
    period,
    antigenCategory,
    data,
    type,
    appendCode
) => ({
    name: `${name}-${antigen.name}-${appendCode}`,
    code: `${datasetId}-${antigen.id}-${appendCode}`,
    showData: true,
    publicAccess: "rw------",
    userOrganisationUnitChildren: false,
    type,
    subscribed: false,
    parentGraphMap: organisationUnitsParents,
    userOrganisationUnit: false,
    regressionType: "NONE",
    completedOnly: false,
    cumulativeValues: false,
    sortOrder: 0,
    favorite: false,
    topLimit: 0,
    hideEmptyRowItems: "AFTER_LAST",
    aggregationType: "DEFAULT",
    userOrganisationUnitGrandChildren: false,
    displayName: `${name}-${antigen.name}-${appendCode}`,
    hideSubtitle: false,
    hideLegend: false,
    externalAccess: false,
    percentStackedValues: false,
    noSpaceBetweenColumns: false,
    hideTitle: false,
    series: "dx",
    category: "pe",
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
    translations: [],
    filterDimensions: ["ou", antigenCategory], // Filter by orgUnits and Antigen category
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
    columns: [{ id: "dx" }],
    organisationUnitGroupSetDimensions: [],
    organisationUnitLevels: [],
    dataElementDimensions: [],
    periods: period,
    organisationUnits: organisationUnitsIds,
    categoryDimensions: [
        { category: { id: antigenCategory }, categoryOptions: [{ id: antigen.id }] }, // TODO get antigen categorID from metadata
    ],
    filters: [{ id: "ou" }, { id: antigenCategory }],
    rows: [{ id: "pe" }],
});

const tableConstructor = (
    name,
    antigen,
    datasetId,
    organisationUnitsIds,
    period,
    antigenCategory,
    data,
    appendCode
) => ({
    name: `${name}-${antigen.name}-${appendCode}`,
    code: `${datasetId}-${antigen.id}-${appendCode}`,
    numberType: "VALUE",
    publicAccess: "rw------",
    userOrganisationUnitChildren: false,
    legendDisplayStyle: "FILL",
    hideEmptyColumns: false,
    subscribed: false,
    hideEmptyRows: true,
    parentGraphMap: {},
    userOrganisationUnit: false,
    rowSubTotals: false,
    displayDensity: "NORMAL",
    completedOnly: false,
    colTotals: true,
    showDimensionLabels: true,
    sortOrder: 0,
    fontSize: "NORMAL",
    favorite: false,
    topLimit: 0,
    aggregationType: "DEFAULT",
    userOrganisationUnitGrandChildren: false,
    displayName: `${name}-${antigen.name}-${appendCode}`,
    hideSubtitle: false,
    externalAccess: false,
    legendDisplayStrategy: "FIXED",
    colSubTotals: false,
    showHierarchy: false,
    rowTotals: false,
    cumulative: false,
    digitGroupSeparator: "NONE",
    hideTitle: false,
    regression: false,
    skipRounding: false,
    reportParams: {
        paramGrandParentOrganisationUnit: false,
        paramReportingPeriod: false,
        paramOrganisationUnit: false,
        paramParentOrganisationUnit: false,
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
    translations: [],
    filterDimensions: ["ou", antigenCategory],
    interpretations: [],
    itemOrganisationUnitGroups: [],
    userGroupAccesses: [],
    programIndicatorDimensions: [],
    subscribers: [],
    attributeValues: [],
    columnDimensions: ["dx"],
    userAccesses: [],
    favorites: [],
    dataDimensionItems: data,
    categoryOptionGroupSetDimensions: [],
    columns: [],
    organisationUnitGroupSetDimensions: [],
    organisationUnitLevels: [],
    dataElementDimensions: [],
    periods: period,
    organisationUnits: organisationUnitsIds,
    categoryDimensions: [
        { category: { id: antigenCategory }, categoryOptions: [{ id: antigen.id }] }, //  TODO: Same as chart
    ],
    filters: [],
    rows: [],
    rowDimensions: ["pe"],
});
