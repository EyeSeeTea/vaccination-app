import _ from "lodash";
import { CampaignSummary } from "../domain/entities/CampaignSummary";
import { CampaignQuery, Filters, ListResult, Pagination } from "../domain/queries/CampaignQuery";
import { getCampaignPeriods } from "../models/CampaignDb";
import { MetadataConfig } from "../models/config";
import DbD2 from "../models/db-d2";
import { MetadataPick } from "../types/d2-api";
import { assert } from "../utils/assert";
import { getCurrentUserDataViewOrganisationUnits } from "../utils/dhis2";

export class CampaignD2Query implements CampaignQuery {
    constructor(private config: MetadataConfig, private db: DbD2) {}

    async list(options: { filters?: Filters; pagination?: Pagination }): Promise<ListResult> {
        const { search } = options.filters || {};
        const { page = 1, pageSize = 20, sorting } = options.pagination || {};

        // We have 3 filters to apply:
        //   1) Filter by name.
        //   2) Filter by by attribute "created by app".
        //   3) Filter by current user access to campaign organisation units.

        // Filters (2) and (3) cannot be included in a single call to the DHIS2 API, so we first
        // make an unpaginated request with filter (1) and then perform the extra filtering
        // and pagination programmatically.
        const metadata = await this.db.d2Api.models.dataSets
            .get({
                paging: true,
                fields: dataSetFields,
                page: 1,
                pageSize: 1000,
                order: this.getD2Order(sorting),
                filter: {
                    ...(search ? { name: { ilike: search } } : {}),
                    // We know a campaign dataset has the category combo for teams, so we can use
                    // it as an initial filter to reduce the number of datasets to filter client-side.
                    "categoryCombo.code": { eq: this.config.categoryCodeForTeams },
                },
            })
            .getData();

        const dataSetsFiltered = metadata.objects.filter(dataSet => {
            return (
                this.isDataSetCreatedByApp(dataSet) &&
                this.isDataSetAccessibleByCurrentUser(dataSet)
            );
        });

        const campaigns = this.mapDataSetToCampaign(dataSetsFiltered);

        return this.paginate(campaigns, pageSize, page);
    }

    private mapDataSetToCampaign(dataSetsFiltered: D2DataSet[]) {
        return dataSetsFiltered.map((dataSet): CampaignSummary => {
            const dates = getCampaignPeriods(dataSet);
            const toStrDate = (date: Date) => assert(date.toISOString().split("T")[0] || "");

            return {
                ...dataSet,
                period: dates
                    ? { start: toStrDate(dates.startDate), end: toStrDate(dates.endDate) }
                    : undefined,
            };
        });
    }

    private paginate(campaigns: CampaignSummary[], pageSize: number, page: number): ListResult {
        const dataSetsPaginated = _(campaigns)
            .drop(pageSize * (page - 1))
            .take(pageSize)
            .value();

        return {
            pager: { page, total: campaigns.length },
            objects: dataSetsPaginated,
        };
    }

    // order=FIELD:DIRECTION where direction = "iasc" | "idesc" (case-insensitive ASC/DESC)
    private getD2Order(sorting: [string, "asc" | "desc"] | undefined) {
        const [field, direction] = sorting || [];
        const order = field && direction ? `${field}:i${direction}` : undefined;
        return order;
    }

    // A dataset is accessible by the current user if all its org units are in the user's data view org units
    private isDataSetAccessibleByCurrentUser(dataSet: D2DataSet) {
        const userOrgUnits = getCurrentUserDataViewOrganisationUnits(this.db.d2);

        return dataSet.organisationUnits.every(dataSetOrgUnit =>
            _(dataSetOrgUnit.path.split("/")).intersection(userOrgUnits).isNotEmpty()
        );
    }

    private isDataSetCreatedByApp(dataSet: D2DataSet) {
        return _(dataSet.attributeValues).some(
            attributeValue =>
                attributeValue.attribute.code === this.config.attributeCodeForApp &&
                attributeValue.value === "true"
        );
    }
}

const dataSetFields = {
    id: true,
    name: true,
    displayName: true,
    displayDescription: true,
    created: true,
    lastUpdated: true,
    publicAccess: true,
    user: { id: true },
    href: true,
    organisationUnits: { id: true, path: true },
    dataInputPeriods: { period: { id: true } },
    attributeValues: { value: true, attribute: { code: true } },
} as const;

type D2DataSet = MetadataPick<{ dataSets: { fields: typeof dataSetFields } }>["dataSets"][number];
