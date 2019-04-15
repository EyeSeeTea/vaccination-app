import { AnalyticsResponse } from "./db-d2";
import { Dictionary } from "lodash";
import moment from "moment";
import { generateUid } from "d2/uid";
import { D2, D2Api } from "./d2.types";
import {
    OrganisationUnit,
    PaginatedObjects,
    CategoryOption,
    CategoryCombo,
    MetadataResponse,
    Metadata,
    ModelFields,
    MetadataGetParams,
    ModelName,
    MetadataFields,
    Attribute,
    DataEntryForm,
    OrganisationUnitPathOnly,
    DashboardData,
    DataValueRequest,
    DataValueResponse,
    Response,
    DataValue,
} from "./db.types";
import _ from "lodash";
import {
    dashboardItemsConfig,
    itemsMetadataConstructor,
    buildDashboardItems,
} from "./dashboard-items";
import { getDaysRange } from "../utils/date";
import { Antigen } from "./campaign";
import "../utils/lodash-mixins";
import { promiseMap } from "../utils/promises";

function getDbFields(modelFields: ModelFields): string[] {
    return _(modelFields)
        .map((value, key) => {
            if (typeof value === "function") {
                return key + "[" + getDbFields(value(metadataFields)).join(",") + "]";
            } else if (typeof value === "boolean") {
                return value ? key : null;
            } else {
                return key + "[" + getDbFields(value).join(",") + "]";
            }
        })
        .compact()
        .value();
}

function toDbParams(metadataParams: MetadataGetParams): Dictionary<string> {
    return _(metadataParams)
        .flatMap((params, modelName) => {
            const fields = metadataFields[modelName as ModelName];
            if (!params) {
                return [];
            } else {
                return [
                    [modelName + ":fields", getDbFields(fields).join(",")],
                    ...(params.filters || []).map(filter => [modelName + ":filter", filter]),
                ];
            }
        })
        .fromPairs()
        .value();
}

export interface AnalyticsRequest {
    dimension: string[];
    filter?: string[];
    skipMeta?: boolean;
}

export interface AnalyticsResponse {
    headers: Array<{
        name: "dx" | "dy";
        column: "Data";
        valueType: "TEXT" | "NUMBER";
        type: "java.lang.String" | "java.lang.Double";
        hidden: boolean;
        meta: boolean;
    }>;

    rows: Array<string[]>;
    width: number;
    height: number;
}

const ref = { id: true };

const metadataFields: MetadataFields = {
    categories: {
        id: true,
        displayName: true,
        code: true,
        dataDimensionType: true,
        dataDimension: true,
        categoryOptions: {
            id: true,
            code: true,
            displayName: true,
        },
    },
    categoryCombos: {
        id: true,
        displayName: true,
        code: true,
        categories: ref,
        categoryOptionCombos: { id: true, name: true },
    },
    categoryOptions: {
        id: true,
        displayName: true,
        code: true,
    },
    categoryOptionGroups: {
        id: true,
        displayName: true,
        code: true,
        categoryOptions: metadataFields => metadataFields.categoryOptions,
    },
    dataElements: {
        id: true,
        code: true,
        displayName: true,
        categoryCombo: metadataFields => metadataFields.categoryCombos,
    },
    dataElementGroups: {
        id: true,
        displayName: true,
        code: true,
        dataElements: ref,
    },
    organisationUnits: {
        id: true,
        displayName: true,
        path: true,
        level: true,
        ancestors: {
            id: true,
            displayName: true,
            path: true,
            level: true,
        },
    },
    organisationUnitLevels: {
        id: true,
        displayName: true,
        level: true,
    },
};

export default class DbD2 {
    d2: D2;
    api: D2Api;

    constructor(d2: D2) {
        this.d2 = d2;
        this.api = d2.Api.getApi();
    }

    public async getMetadata<T>(params: MetadataGetParams): Promise<T> {
        const options = { translate: true, ...toDbParams(params) };
        const metadata = await this.api.get("/metadata", options);
        const metadataWithEmptyRecords = _(params)
            .keys()
            .map(key => [key, metadata[key] || []])
            .fromPairs()
            .value();
        return metadataWithEmptyRecords as T;
    }

    public async getOrganisationUnitsFromIds(
        ids: string[],
        options: { pageSize?: number }
    ): Promise<PaginatedObjects<OrganisationUnit>> {
        const { pager, organisationUnits } = await this.api.get("/organisationUnits", {
            paging: true,
            pageSize: options.pageSize || 10,
            filter: [
                `id:in:[${_(ids)
                    .take(options.pageSize)
                    .join(",")}]`,
            ],
            fields: ["id", "displayName", "path", "level", "ancestors[id,displayName,path,level]"],
        });
        const newPager = { ...pager, total: ids.length };
        return { pager: newPager, objects: organisationUnits };
    }

    public async validateTeamsForOrganisationUnits(organisationUnits: OrganisationUnitPathOnly[]) {
        const allAncestorsIds = _(organisationUnits)
            .map("path")
            .flatMap(path => path.split("/").slice(1))
            .uniq()
            .value()
            .join(",");

        const { categoryOptions } = await this.api.get("/metadata", {
            "categoryOptions:fields": "id,organisationUnits",
            "categoryOptions:filter": `organisationUnits.id:in:[${allAncestorsIds}]`, //Missing categoryTeamCode
        });

        const hasTeams = (path: string) => {
            if (!categoryOptions) return false;
            const has = categoryOptions.some((cat: CategoryOption) =>
                cat.organisationUnits.some((ou: OrganisationUnit) => path.includes(ou.id))
            );
            return has;
        };

        return _(organisationUnits)
            .map(ou => ({ id: ou.id, hasTeams: hasTeams(ou.path) }))
            .value();
    }

    public async getCategoryOptionsByCategoryCode(code: string): Promise<CategoryOption[]> {
        const { categories } = await this.api.get("/categories", {
            filter: [`code:in:[${code}]`],
            fields: ["categoryOptions[id,displayName,code,dataDimension,dataDimensionType]"],
        });

        if (_(categories).isEmpty()) {
            return [];
        } else {
            return _(categories[0].categoryOptions)
                .sortBy("displayName")
                .value();
        }
    }

    public async getCategoryCombosByCode(codes: string[]): Promise<CategoryCombo[]> {
        const { categoryCombos } = await this.api.get("/categoryCombos", {
            paging: false,
            filter: [`code:in:[${codes.join(",")}]`],
            fields: ["id,code,displayName"],
        });
        return categoryCombos;
    }

    public async postMetadata(metadata: Metadata): Promise<MetadataResponse> {
        return this.api.post("/metadata", metadata) as Promise<MetadataResponse>;
    }

    public async postForm(dataSetId: string, dataEntryForm: DataEntryForm): Promise<boolean> {
        await this.api.post(["dataSets", dataSetId, "form"].join("/"), dataEntryForm);
        return true;
    }

    public async postDataValues(dataValues: DataValue[]): Promise<Response<string[]>> {
        const dataValueRequests: DataValueRequest[] = _(dataValues)
            .groupBy(dv => {
                const parts = [
                    dv.dataSet,
                    dv.completeDate,
                    dv.period,
                    dv.orgUnit,
                    dv.attributeOptionCombo,
                ];
                return parts.join("-");
            })
            .values()
            .map(group => {
                const dv0 = group[0];
                return {
                    dataSet: dv0.dataSet,
                    completeDate: dv0.completeDate,
                    period: dv0.period,
                    orgUnit: dv0.orgUnit,
                    attributeOptionCombo: dv0.attributeOptionCombo,
                    dataValues: group.map(dv => ({
                        dataElement: dv.dataElement,
                        categoryOptionCombo: dv.categoryOptionCombo,
                        value: dv.value,
                        comment: dv.comment,
                    })),
                };
            })
            .value();

        const responses = await promiseMap(dataValueRequests, dataValueRequest => {
            return this.api.post("dataValueSets", dataValueRequest) as Promise<DataValueResponse>;
        });
        const errorResponses = responses.filter(response => response.status !== "SUCCESS");

        if (_(errorResponses).isEmpty()) {
            return { status: true };
        } else {
            return { status: false, error: errorResponses.map(response => response.description) };
        }
    }

    public async getAttributeIdByCode(code: string): Promise<Attribute | undefined> {
        const { attributes } = await this.api.get("/attributes", {
            paging: true,
            pageSize: 1,
            filter: [`code:eq:${code}`],
            fields: ["id"],
        });
        return attributes[0];
    }

    async getMetadataForDashboardItems(
        antigens: Antigen[],
        organisationUnitsPathOnly: OrganisationUnitPathOnly[],
        categoryCodeForTeams: string
    ) {
        const allAncestorsIds = _(organisationUnitsPathOnly)
            .map("path")
            .flatMap(path => path.split("/").slice(1))
            .uniq()
            .value()
            .join(",");

        const orgUnitsId = _(organisationUnitsPathOnly).map("id");
        const dashboardItems = [dashboardItemsConfig.charts, dashboardItemsConfig.tables];
        const elements = _(dashboardItems)
            .values()
            .flatMap(_.values)
            .groupBy("dataType")
            .mapValues(objs => _.flatMap(objs, "elements"))
            .value();

        const allDataElementCodes = elements["DATA_ELEMENT"].join(",");
        const allIndicatorCodes = elements["INDICATOR"].join(",");
        const antigenCodes = antigens.map(an => an.code);
        const {
            categories,
            dataElements,
            indicators,
            categoryOptions,
            organisationUnits: organisationUnitsWithName,
        } = await this.api.get("/metadata", {
            "categories:fields": "id,categoryOptions[id,code,name]",
            "categories:filter": `code:in:[${dashboardItemsConfig.antigenCategoryCode}]`,
            "dataElements:fields": "id,code",
            "dataElements:filter": `code:in:[${allDataElementCodes}]`,
            "indicators:fields": "id,code",
            "indicators:filter": `code:in:[${allIndicatorCodes}]`,
            "categoryOptions:fields": "id,categories[id,code],organisationUnits",
            "categoryOptions:filter": `organisationUnits.id:in:[${allAncestorsIds}]`, //Missing categoryTeamCode
            "organisationUnits:fields": "id,displayName,path",
            "organisationUnits:filter": `id:in:[${orgUnitsId}]`,
        });

        const { id: antigenCategory } = categories[0];
        const antigensMeta = _.filter(categories[0].categoryOptions, op =>
            _.includes(antigenCodes, op.code)
        );

        if (!categoryOptions || !categoryOptions[0].categories) {
            throw new Error("Organization Units chosen have no teams associated"); // TEMP: Check will be made dynamically on orgUnit selection step
        }

        const teamsByOrgUnit = organisationUnitsPathOnly.reduce((acc, ou) => {
            let teams: string[] = [];
            categoryOptions.forEach((opt: { id: string; organisationUnits: string[] }) => {
                const categoryOptOU = _.map(opt.organisationUnits, "id");
                if (_.some(categoryOptOU, (o: string) => ou.path.includes(o))) {
                    teams.push(opt.id);
                }
            });
            return { ...acc, [ou.id]: teams };
        }, {});

        const teamsMetadata: Dictionary<any> = {
            ...teamsByOrgUnit,
            categoryId: categoryOptions[0].categories[0].id,
        };

        const dashboardMetadata = {
            antigenCategory,
            dataElements: {
                type: "DATA_ELEMENT",
                data: dataElements,
                key: "dataElement",
            },
            indicators: {
                type: "INDICATOR",
                data: indicators,
                key: "indicator",
            },
            antigensMeta,
            organisationUnitsWithName,
            disaggregationMetadata: {
                teams: (antigen = null, orgUnit: { id: string }) => ({
                    categoryId: teamsMetadata.categoryId,
                    teams: teamsMetadata[orgUnit.id],
                }),
            },
        };

        return dashboardMetadata;
    }

    public async createDashboard(
        datasetName: String,
        organisationUnits: OrganisationUnitPathOnly[],
        antigens: Antigen[],
        startDate: Date | null,
        endDate: Date | null,
        categoryCodeForTeams: string
    ): Promise<DashboardData> {
        const dashboardItemsMetadata = await this.getMetadataForDashboardItems(
            antigens,
            organisationUnits,
            categoryCodeForTeams
        );

        const dashboardItems = this.createDashboardItems(
            datasetName,
            startDate,
            endDate,
            dashboardItemsMetadata
        );

        const keys: Array<keyof DashboardData> = ["items", "charts", "reportTables"];
        const { items, charts, reportTables } = _(keys)
            .map(key => [key, _(dashboardItems).getOrFail(key)])
            .fromPairs()
            .value();

        const dashboard = {
            id: generateUid(),
            name: `${datasetName}_DASHBOARD`,
            dashboardItems: items,
        };

        return { dashboard, charts, reportTables };
    }

    createDashboardItems(
        datasetName: String,
        startDate: Date | null,
        endDate: Date | null,
        dashboardItemsMetadata: Dictionary<any>
    ): DashboardData {
        const { organisationUnitsWithName } = dashboardItemsMetadata;
        const organisationUnitsMetadata = organisationUnitsWithName.map((ou: OrganisationUnit) => ({
            id: ou.id,
            parents: { [ou.id]: ou.path },
            name: ou.displayName,
        }));
        const periodStart = startDate ? moment(startDate) : moment();
        const periodEnd = endDate ? moment(endDate) : moment().endOf("year");
        const periodRange = getDaysRange(periodStart, periodEnd);
        const period = periodRange.map(date => ({ id: date.format("YYYYMMDD") }));
        const antigensMeta = _(dashboardItemsMetadata).getOrFail("antigensMeta");
        const dashboardItemsElements = itemsMetadataConstructor(dashboardItemsMetadata);

        const { antigenCategoryCode, ...itemsConfig } = dashboardItemsConfig;
        const expectedCharts = _.flatMap(itemsConfig, _.keys);

        const keys = ["antigenCategory", "disaggregationMetadata", ...expectedCharts] as Array<
            keyof typeof dashboardItemsElements
        >;
        const { antigenCategory, disaggregationMetadata, ...elements } = _(keys)
            .map(key => [key, _(dashboardItemsElements).getOrFail(key)])
            .fromPairs()
            .value();

        const dashboardItems = buildDashboardItems(
            antigensMeta,
            datasetName,
            organisationUnitsMetadata,
            period,
            antigenCategory,
            disaggregationMetadata,
            elements
        );
        const charts = _(dashboardItems).getOrFail("charts");
        const reportTables = _(dashboardItems).getOrFail("reportTables");

        const chartIds = charts.map(chart => chart.id);
        const reportTableIds = reportTables.map(table => table.id);

        const dashboardCharts = chartIds.map((id: string) => ({
            type: "CHART",
            chart: { id },
        }));
        const dashboardTables = reportTableIds.map((id: string) => ({
            type: "REPORT_TABLE",
            reportTable: { id },
        }));

        const dashboardData = {
            items: [...dashboardCharts, ...dashboardTables],
            charts,
            reportTables,
        };

        return dashboardData;
    }

    public getAnalytics(request: AnalyticsRequest): Promise<AnalyticsResponse> {
        return this.api.get("/analytics", request) as Promise<AnalyticsResponse>;
    }
}
