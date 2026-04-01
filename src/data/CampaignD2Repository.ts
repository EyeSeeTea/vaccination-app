import _ from "lodash";
import { CampaignRepository, DeleteResponse } from "../domain/repositories/CampaignRepository";
import i18n from "../locales";
import Campaign, {
    CampaignId,
    DashboardWithResources,
    DataSetWithOrgUnits,
} from "../models/campaign";
import CampaignDb from "../models/CampaignDb";
import { getByIndex, getDashboardCode, MetadataConfig } from "../models/config";
import DbD2, { ApiResponse, toStatusResponse } from "../models/db-d2";
import { MetadataResponse, Ref, Response } from "../models/db.types";
import { filterTeamsByNames, getTeamsForCampaign } from "../models/Teams";
import { promiseMap } from "../utils/promises";
import { CampaignD2Get } from "./CampaignD2Get";

type ErrorKey = "teams" | "dashboards" | "other";
const keys: ErrorKey[] = ["dashboards", "other", "teams"];

export class CampaignD2Repository implements CampaignRepository {
    constructor(private config: MetadataConfig, private db: DbD2) {}

    async get(id: string): Promise<Campaign> {
        return new CampaignD2Get(this.config, this.db).execute(id);
    }

    async save(campaign: Campaign): Promise<Response<string>> {
        return new CampaignDb(campaign).save();
    }

    async delete(campaignIds: CampaignId[]): Promise<DeleteResponse> {
        try {
            return await this.delete_(campaignIds);
        } catch (error) {
            return {
                status: false,
                dataSetsWithDataValues: [],
                error: {
                    level: "error",
                    message: getStringMessageFromError(error),
                    keys: ["other"],
                },
            };
        }
    }

    async delete_(campaignIds: CampaignId[]): Promise<DeleteResponse> {
        const { dataSets } = await this.db.d2Api.metadata
            .get({
                dataSets: {
                    fields: { id: true, name: true, organisationUnits: { id: true } },
                    filter: { id: { in: campaignIds } },
                },
            })
            .getData();

        const modelReferencesToDelete = await this.getResources(dataSets);

        const dataSetsWithDataValues = _.compact(
            await promiseMap(dataSets, dataSet => {
                return this.hasDataValues(dataSet.id).then(hasDataValues =>
                    hasDataValues ? dataSet : null
                );
            })
        );

        // If we try to delete all objects all at once, we get this error from the /metadata endpoint:
        // "Could not delete due to association with another object: CategoryDimension"
        // It does work, however, if we delete the objects in this order:
        // 1) Dashboards, 2) Everything else except Category options 3) Category options (teams),

        const referencesGroups = _(modelReferencesToDelete)
            .groupBy(({ model }): ErrorKey => {
                if (model === "dashboards") {
                    return "dashboards";
                } else if (model === "categoryOptions") {
                    return "teams";
                } else {
                    return "other";
                }
            })
            .toPairs()
            .sortBy(([key, _group]) => _.indexOf(keys, key))
            .map(([key, group]) => [key, _.uniqBy(group, "id")] as [ErrorKey, typeof group])
            .value();

        const results: Array<[ErrorKey, ApiResponse<MetadataResponse>]> = await promiseMap(
            referencesGroups,
            async ([key, references]) => {
                const metadata = _(references)
                    .groupBy(ref => ref.model)
                    .mapValues(groups => groups.map(group => ({ id: group.id })))
                    .value();
                const response = await this.db.postMetadata(metadata, { importStrategy: "DELETE" });
                return [key, toStatusResponse(response)] as [
                    typeof key,
                    ApiResponse<MetadataResponse>
                ];
            }
        );

        const keysWithErrors = _(results)
            .map(([key, result]) => (result.status ? null : key))
            .compact()
            .value();

        const errors = _(results)
            .map(([_key, result]) => (result.status ? null : result.error))
            .compact()
            .value();

        if (!keysWithErrors || _.isEmpty(keysWithErrors)) {
            return {
                status: true,
                dataSetsWithDataValues: dataSetsWithDataValues,
            };
        } else if (keysWithErrors && _.isEqual(keysWithErrors, ["teams"])) {
            return {
                status: false,
                dataSetsWithDataValues: dataSetsWithDataValues,
                error: {
                    level: "warning",
                    message: i18n.t(
                        "Campaign teams (category options) could not be deleted, probably there are associated data values"
                    ),
                    keys: keysWithErrors,
                },
            };
        } else {
            return {
                status: false,
                dataSetsWithDataValues: dataSetsWithDataValues,
                error: {
                    level: "error",
                    message: errors.join("\n"),
                    keys: keysWithErrors,
                },
            };
        }
    }

    public async hasDataValues(campaignId: string): Promise<boolean> {
        const campaign = await this.get(campaignId);
        return CampaignD2Repository.hasDataValues(this.db, this.config, campaign.getDataSet());
    }

    static async hasDataValues(
        db: DbD2,
        config: MetadataConfig,
        dataSet: DataSetWithOrgUnits
    ): Promise<boolean> {
        if (!dataSet.id) {
            return false;
        } else {
            const { categories, categoryComboCodeForTeams } = config;
            const orgUnitIds = dataSet.organisationUnits.map(ou => ou.id);
            const teamsCategoryId = getByIndex(categories, "code", categoryComboCodeForTeams).id;
            const teams = await getTeamsForCampaign(db, orgUnitIds, teamsCategoryId, dataSet.name);

            const dataValues = await db.getDataValues({
                dataSet: [dataSet.id],
                orgUnit: dataSet.organisationUnits.map(ou => ou.id),
                lastUpdated: "1970",
                includeDeleted: true,
            });

            // Returned data values are not really specific for this dataset, so let's
            // apply an extra filter by team.
            const teamsCocs = new Set(
                _.flatMap(teams, team => team.categoryOptionCombos.map(coc => coc.id))
            );

            return dataValues.some(
                dataValue =>
                    !!dataValue.attributeOptionCombo &&
                    teamsCocs.has(dataValue.attributeOptionCombo)
            );
        }
    }

    private async getResources(dataSets: DataSetWithOrgUnits[]) {
        const { config, db } = this;
        if (_.isEmpty(dataSets)) return [];

        const codes = _(dataSets)
            .map(dataSet => dataSet.id)
            .compact()
            .map(dataSetId => getDashboardCode(config, dataSetId))
            .value();

        const { dashboards } = await db.getMetadata<{ dashboards: DashboardWithResources[] }>({
            dashboards: {
                fields: {
                    id: true,
                    name: true,
                    dashboardItems: {
                        id: true,
                        visualization: { id: true },
                    },
                },
                filters: [`code:in:[${codes.join(",")}]`],
            },
        });

        const campaignNames = dataSets.map(d => d.name);

        const { categoryOptions: teams } = await db.api.get("/categoryOptions", {
            fields: ["id,name,categories[id]"],
            filter: campaignNames.map(cn => `name:like$:${cn}`),
            rootJunction: "OR",
            paging: false,
        });

        const { categories, categoryComboCodeForTeams } = config;
        const teamsCategoyId = getByIndex(categories, "code", categoryComboCodeForTeams).id;

        const filteredTeams = filterTeamsByNames(teams, campaignNames, teamsCategoyId);

        const resources: { model: string; id: string }[] = _(dashboards)
            .flatMap(dashboard => dashboard.dashboardItems)
            .flatMap(item => [{ model: "visualizations", ref: item.visualization }])
            .map(({ model, ref }) => (ref ? { model, id: ref.id } : null))
            .compact()
            .value();

        return _.concat(
            dashboards.map(dashboard => ({ model: "dashboards", id: dashboard.id })),
            _(dataSets)
                .map(dataSet => (dataSet.id ? { model: "dataSets", id: dataSet.id } : null))
                .compact()
                .value(),
            resources,
            filteredTeams.map((team: Ref) => ({ model: "categoryOptions", id: team.id }))
        );
    }
}

function getStringMessageFromError(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    } else if (typeof error === "string") {
        return error;
    } else {
        return String(error);
    }
}
