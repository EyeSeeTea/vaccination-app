export const chart = name => ({
    aggregationType: "DEFAULT",
    baseLineLabel: null,
    baseLineValue: null,
    columns: [{ dimension: "dx", items: [{ id: "u23TODO5lgp" }, { id: "iQxStM1uZWH" }] }],
    completedOnly: false,
    cumulativeValues: false,
    description: "",
    domainAxisLabel: null,
    favorite: false,
    filters: [{ dimension: "ou", items: [{ id: "nIaj4DxM6tJ" }] }],
    hideEmptyRowItems: "NONE",
    hideLegend: false,
    hideSubtitle: false,
    hideTitle: false,
    name: `${name}_GENERIC_CHART`,
    noSpaceBetweenColumns: false,
    percentStackedValues: false,
    prototype: {},
    rangeAxisDecimals: null,
    rangeAxisLabel: null,
    rangeAxisMaxValue: null,
    rangeAxisMinValue: null,
    rangeAxisSteps: null,
    regressionType: "NONE",
    reportParams: {},
    rows: [
        {
            dimension: "pe",
            items: [
                { id: "201901" },
                { id: "201902" },
                { id: "201903" },
                { id: "201904" },
                { id: "201905" },
                { id: "201906" },
                { id: "201907" },
                { id: "201908" },
                { id: "201909" },
                { id: "201910" },
                { id: "201911" },
                { id: "201912" },
                { id: "LAST_12_MONTHS" },
            ],
        },
    ],
    showData: true,
    sortOrder: 0,
    subscribed: false,
    subtitle: null,
    targetLineLabel: null,
    targetLineValue: null,
    title: null,
    type: "COLUMN",
});

export const reportTable = name => ({
    aggregationType: "DEFAULT",
    colSubTotals: false,
    colTotals: false,
    columns: [
        {
            dimension: "dx",
            items: [{ id: "iOm4rdPShkc" }, { id: "qkQzIlsD9X9" }, { id: "awMJ6UnQn5P" }],
        },
    ],
    completedOnly: false,
    cumulative: false,
    dataApprovalLevel: null,
    description: "",
    digitGroupSeparator: "NONE",
    displayDensity: "NORMAL",
    favorite: false,
    filters: [{ dimension: "ou", items: [{ id: "nIaj4DxM6tJ" }] }],
    fontSize: "NORMAL",
    hideEmptyColumns: false,
    hideEmptyRows: false,
    legendDisplayStrategy: "FIXED",
    legendDisplayStyle: "FILL",
    legendSet: null,
    measureCriteria: "",
    name: `${name}_GENERIC_REPORT_TABLE`,
    numberType: "VALUE",
    regression: false,
    reportParams: {
        paramReportingPeriod: false,
        paramOrganisationUnit: false,
        paramParentOrganisationUnit: false,
    },
    rowSubTotals: false,
    rowTotals: false,
    rows: [
        {
            dimension: "pe",
            items: [
                { id: "201901" },
                { id: "201902" },
                { id: "201903" },
                { id: "201904" },
                { id: "201905" },
                { id: "201906" },
                { id: "201907" },
                { id: "201908" },
                { id: "201909" },
                { id: "201910" },
                { id: "201911" },
                { id: "201912" },
                { id: "LAST_12_MONTHS" },
            ],
        },
    ],
    showDimensionLabels: true,
    showHierarchy: false,
    skipRounding: false,
    sortOrder: 0,
    stickyColumnDimension: false,
    stickyRowDimension: false,
    subscribed: false,
    topLimit: 0,
});
