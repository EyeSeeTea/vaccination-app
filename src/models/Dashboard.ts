import _, { Dictionary } from "lodash";
import DbD2 from "./db-d2";
import { generateUid } from "d2/uid";
import {
    dashboardItemsConfig,
    itemsMetadataConstructor,
    buildDashboardItems,
} from "./dashboard-items";
import {
    Ref,
    OrganisationUnitPathOnly,
    OrganisationUnitWithName,
    Sharing,
    CategoryOption,
} from "./db.types";
import { Antigen } from "./campaign";
import { Moment } from "moment";
import { getDaysRange } from "../utils/date";
import { AntigenDisaggregationEnabled } from "./AntigensDisaggregation";
import { MetadataConfig } from "./config";

type DashboardItem = {
    type: string;
    visualization: Ref;
};

export interface ChartItem extends DashboardItem {}

export interface ReportTableItem extends DashboardItem {}

type DashboardData = {
    id: string;
    name: string;
    code: string;
    dashboardItems: Array<ReportTableItem | ChartItem>;
};

type AllDashboardElements = {
    charts: Array<object>;
    reportTables: Array<object>;
    items: Array<ChartItem | ReportTableItem>;
};

export type DashboardMetadata = {
    dashboards: DashboardData[];
    visualizations: object[];
};

export class Dashboard {
    constructor(private db: DbD2) {}

    static build(db: DbD2) {
        return new Dashboard(db);
    }

    private async getMetadataForDashboardItems(
        antigens: Antigen[],
        organisationUnitsPathOnly: OrganisationUnitPathOnly[],
        antigensDisaggregation: AntigenDisaggregationEnabled,
        teamIds: string[],
        metadataConfig: MetadataConfig,
        allCategoryIds: { ageGroup: string; doses: string; teams: string; antigen: string }
    ) {
        const orgUnitsId = _(organisationUnitsPathOnly).map("id");
        const { organisationUnits: organisationUnitsWithName } = await this.db.api.get<{
            organisationUnits?: { id: string; displayName: string; path: string }[];
        }>("/metadata", {
            "organisationUnits:fields": "id,displayName,path",
            "organisationUnits:filter": `id:in:[${orgUnitsId}]`,
        });
        const antigenCodes = antigens.map(an => an.code);
        const antigensMeta = _.filter(metadataConfig.antigens, an =>
            _.includes(antigenCodes, an.code)
        );

        const elementsToFetch = dashboardItemsConfig.metadataToFetch;

        const allDataElementCodes = elementsToFetch.DATA_ELEMENT.join(",");
        const dataElements = _.filter(metadataConfig.dataElements, de =>
            _.includes(allDataElementCodes, de.code)
        );

        const allIndicatorCodes = elementsToFetch.INDICATOR.join(",");
        const indicators = _.filter(metadataConfig.indicators, indicator =>
            _.includes(allIndicatorCodes, indicator.code)
        );

        const categoryOptionsByName: _.Dictionary<string> = _(metadataConfig.categoryOptions)
            .map(co => [co.displayName, co.id])
            .fromPairs()
            .value();

        const ageGroupsToId = (ageGroups: CategoryOption[]): string[] =>
            _.compact(_.map(ageGroups, ag => categoryOptionsByName[ag.displayName]));

        const ageGroupsByAntigen: _.Dictionary<string[]> = _(antigensDisaggregation)
            .map(d => [d.antigen.id, ageGroupsToId(d.ageGroups)])
            .fromPairs()
            .value();

        const dosesByAntigen = _(antigensDisaggregation)
            .map(d => [d.antigen.id, d.antigen.doses])
            .fromPairs()
            .value();

        const dashboardMetadata = {
            antigenCategory: allCategoryIds.antigen,
            elementsMetadata: [
                {
                    type: "DATA_ELEMENT",
                    data: dataElements,
                    key: "dataElement",
                },
                {
                    type: "INDICATOR",
                    data: indicators,
                    key: "indicator",
                },
            ],
            antigensMeta,
            organisationUnitsWithName,
            legendMetadata: {
                get: (code: string) =>
                    _(metadataConfig.legendSets).keyBy("code").getOrFail(code).id,
            },
            disaggregationMetadata: {
                teams: () => ({
                    categoryId: allCategoryIds.teams,
                    elements: teamIds,
                }),
                ageGroups: (antigen: Ref) => ({
                    categoryId: allCategoryIds.ageGroup,
                    elements: ageGroupsByAntigen[antigen.id],
                }),
                doses: (antigen: Ref) => ({
                    categoryId: allCategoryIds.doses,
                    elements: dosesByAntigen[antigen.id],
                }),
            },
        };

        return dashboardMetadata;
    }

    public async create({
        dashboardId,
        datasetName,
        organisationUnits,
        antigens,
        startDate,
        endDate,
        antigensDisaggregation,
        teamIds,
        metadataConfig,
        dashboardCode,
        sharing,
        allCategoryIds,
    }: {
        dashboardId?: string;
        datasetName: string;
        organisationUnits: OrganisationUnitPathOnly[];
        antigens: Antigen[];
        startDate: Moment;
        endDate: Moment;
        antigensDisaggregation: AntigenDisaggregationEnabled;
        teamIds: string[];
        dashboardCode: string;
        sharing: Sharing;
        allCategoryIds: { ageGroup: string; doses: string; antigen: string; teams: string };
        metadataConfig: MetadataConfig;
    }): Promise<DashboardMetadata> {
        const dashboardItemsMetadata = await this.getMetadataForDashboardItems(
            antigens,
            organisationUnits,
            antigensDisaggregation,
            teamIds,
            metadataConfig,
            allCategoryIds
        );

        const dashboardItems = this.createDashboardItems(
            datasetName,
            startDate,
            endDate,
            dashboardItemsMetadata,
            sharing
        );

        const keys: Array<keyof AllDashboardElements> = ["items", "charts", "reportTables"];
        const { items, charts, reportTables } = _(keys)
            .map(key => [key, _(dashboardItems).getOrFail(key)])
            .fromPairs()
            .value();

        const dashboard = {
            id: dashboardId || generateUid(),
            name: `${datasetName}`,
            code: dashboardCode,
            dashboardItems: items,
            ...sharing,
        };

        const visualizations = _.concat(charts, reportTables);

        return { dashboards: [dashboard], visualizations };
    }

    createDashboardItems(
        datasetName: String,
        startDate: Moment,
        endDate: Moment,
        dashboardItemsMetadata: Dictionary<any>,
        sharing: Sharing
    ): AllDashboardElements {
        const { organisationUnitsWithName, legendMetadata } = dashboardItemsMetadata;
        const organisationUnitsMetadata = organisationUnitsWithName.map(
            (ou: OrganisationUnitWithName) => ({
                id: ou.id,
                parents: { [ou.id]: ou.path },
                name: ou.displayName,
            })
        );
        const periodRange = getDaysRange(startDate, endDate);
        const periodItems = periodRange.map(date => ({ id: date.format("YYYYMMDD") }));
        const antigensMeta = _(dashboardItemsMetadata).getOrFail("antigensMeta");
        const dashboardItemsElements = itemsMetadataConstructor(dashboardItemsMetadata);

        const { metadataToFetch: _metadataToFetch, ...itemsConfig } = dashboardItemsConfig;
        const expectedCharts = _.flatMap(itemsConfig, _.keys);

        const keys = ["antigenCategory", "disaggregationMetadata", ...expectedCharts] as Array<
            keyof typeof dashboardItemsElements
        >;
        const {
            antigenCategory,
            disaggregationMetadata,
            legendsMetadata: _legendsMetadata,
            ...elements
        } = _(keys)
            .map(key => [key, _(dashboardItemsElements).get(key, null)])
            .fromPairs()
            .pickBy()
            .value();

        const dashboardItems = buildDashboardItems(
            antigensMeta,
            datasetName,
            organisationUnitsMetadata,
            periodItems,
            antigenCategory,
            disaggregationMetadata,
            elements,
            legendMetadata
        );
        const charts = _(dashboardItems).getOrFail("charts");
        const reportTables = _(dashboardItems).getOrFail("reportTables");

        const chartIds = charts.map((chart: any) => chart.id);
        const reportTableIds = reportTables.map(table => table.id);

        const dashboardCharts = chartIds.map((id: string) => ({
            type: "VISUALIZATION",
            visualization: { id },
        }));

        const dashboardTables = reportTableIds.map((id: string) => ({
            type: "VISUALIZATION",
            visualization: { id },
        }));

        const dashboardData = {
            items: [...dashboardCharts, ...dashboardTables],
            charts: addSharing(sharing, charts),
            reportTables: addSharing(sharing, reportTables),
        };

        return dashboardData;
    }
}

function addSharing(sharing: Sharing, objects: object[]): object[] {
    return objects.map(object => ({
        ...object,
        ...sharing,
    }));
}
