import { OrganisationUnit, Maybe, Ref, MetadataResponse, Sharing } from "./db.types";
import _, { Dictionary } from "lodash";
import moment from "moment";

import { PaginatedObjects, OrganisationUnitPathOnly, Response } from "./db.types";
import DbD2, { ApiResponse, toStatusResponse } from "./db-d2";
import { AntigensDisaggregation, SectionForDisaggregation } from "./AntigensDisaggregation";
import { MetadataConfig, getDashboardCode, getByIndex, baseConfig } from "./config";
import { AntigenDisaggregationEnabled } from "./AntigensDisaggregation";
import {
    TargetPopulation,
    TargetPopulationData as TargetPopulationData_,
} from "./TargetPopulation";
import CampaignDb, { getCampaignPeriods } from "./CampaignDb";
import { promiseMap } from "../utils/promises";
import i18n from "../locales";
import { TeamsMetadata, getTeamsForCampaign, filterTeamsByNames } from "./Teams";
import CampaignSharing from "./CampaignSharing";
import { CampaignNotification } from "./CampaignNotification";

export type TargetPopulationData = TargetPopulationData_;

export interface Antigen {
    id: string;
    name: string;
    code: string;
    doses: { id: string; name: string }[];
}

export interface Data {
    id: Maybe<string>;
    name: string;
    description: string;
    organisationUnits: OrganisationUnitPathOnly[];
    startDate: Date | null;
    endDate: Date | null;
    antigens: Antigen[];
    antigensDisaggregation: AntigensDisaggregation;
    targetPopulation: Maybe<TargetPopulation>;
    teams: Maybe<number>;
    teamsMetadata: TeamsMetadata;
    dashboardId: Maybe<string>;
}

type ValidationErrors = Array<{
    key: string;
    namespace?: _.Dictionary<string>;
}>;

function getError(key: string, namespace: Maybe<Dictionary<string>> = undefined): ValidationErrors {
    return namespace ? [{ key, namespace }] : [{ key }];
}

interface DataSetWithOrgUnits {
    id?: string;
    name: string;
    organisationUnits: Ref[];
}

interface DashboardWithResources {
    id: string;
    name: string;
    dashboardItems: {
        id: string;
        visualization: Ref;
    };
}

export default class Campaign {
    public selectableLevels: number[] = [5];
    private maxNameLength = 140;

    validations: _.Dictionary<() => ValidationErrors | Promise<ValidationErrors>> = {
        name: this.validateName,
        startDate: this.validateStartDate,
        endDate: this.validateEndDate,
        teams: this.validateTeams,
        organisationUnits: this.validateOrganisationUnits,
        antigens: this.validateAntigens,
        targetPopulation: this.validateTargetPopulation,
        antigensDisaggregation: this.validateAntigensDisaggregation,
    };

    constructor(public db: DbD2, public config: MetadataConfig, private data: Data) {}

    public static create(config: MetadataConfig, db: DbD2): Campaign {
        const antigens: Antigen[] = [];
        const organisationUnits: OrganisationUnit[] = [];

        const initialData = {
            id: undefined,
            name: "",
            description: "",
            organisationUnits: organisationUnits,
            startDate: null,
            endDate: null,
            antigens: antigens,
            antigensDisaggregation: AntigensDisaggregation.build(config, antigens, []),
            targetPopulation: undefined,
            teams: undefined,
            teamsMetadata: {
                elements: [],
            },
            dashboardId: undefined,
        };

        return new Campaign(db, config, initialData);
    }

    public static async get(
        config: MetadataConfig,
        db: DbD2,
        dataSetId: string
    ): Promise<Campaign> {
        const {
            dataSets: [dataSet],
            dashboards: [dashboard],
        } = await db.getMetadata<{
            dataSets: Array<{
                id: string;
                name: string;
                description: string;
                organisationUnits: Array<OrganisationUnitPathOnly>;
                dataInputPeriods: Array<{ period: { id: string } }>;
                sections: Array<SectionForDisaggregation>;
                attributeValues: Array<{ attribute: { code: string }; value: string }>;
            }>;
            dashboards: Array<{
                id: string;
            }>;
        }>({
            dataSets: {
                fields: {
                    id: true,
                    name: true,
                    description: true,
                    organisationUnits: { id: true, path: true },
                    dataInputPeriods: { period: { id: true } },
                    attributeValues: { attribute: { code: true }, value: true },
                    sections: {
                        id: true,
                        name: true,
                        dataSet: { id: true },
                        dataElements: { id: true },
                        sortOrder: true,
                        greyedFields: {
                            categoryOptionCombo: {
                                id: true,
                                categoryOptions: {
                                    id: true,
                                    name: true,
                                    displayName: true,
                                    categories: { id: true },
                                },
                            },
                            dataElement: { id: true },
                        },
                    },
                },
                filters: [`id:eq:${dataSetId}`],
            },
            dashboards: {
                fields: { id: true },
                filters: [`code:eq:${getDashboardCode(config, dataSetId)}`],
            },
        });
        if (!dataSet) throw new Error(`Dataset id=${dataSetId} not found`);

        const antigensByCode = _.keyBy(config.antigens, "code");
        const antigens = _(dataSet.sections)
            .map(section => antigensByCode[section.name])
            .compact()
            .value();

        const periods = getCampaignPeriods(dataSet);

        const { categoryComboCodeForTeams } = config;
        const { name, sections } = dataSet;
        const ouIds = dataSet.organisationUnits.map(ou => ou.id);
        const teamsCategoyId = getByIndex(config.categories, "code", categoryComboCodeForTeams).id;
        const teamsMetadata = await getTeamsForCampaign(db, ouIds, teamsCategoyId, name);
        const antigensDisaggregation = AntigensDisaggregation.build(config, antigens, sections);

        const initialData: Data = {
            id: dataSet.id,
            name: dataSet.name,
            description: dataSet.description,
            organisationUnits: dataSet.organisationUnits,
            startDate: periods ? periods.startDate : null,
            endDate: periods ? periods.endDate : null,
            antigens: antigens,
            antigensDisaggregation,
            targetPopulation: undefined,
            teams: _.size(teamsMetadata),
            teamsMetadata: { elements: teamsMetadata },
            dashboardId: dashboard ? dashboard.id : undefined,
        };

        return new Campaign(db, config, initialData);
    }

    public update(newData: Data) {
        return new Campaign(this.db, this.config, newData);
    }

    public async notifyOnUpdateIfData(): Promise<boolean> {
        const { db } = this;

        if (this.isEdit() && (await this.hasDataValues())) {
            const notification = new CampaignNotification(db);
            return notification.sendOnUpdateOrDelete([this.getDataSet()], "update");
        } else {
            return false;
        }
    }

    public static async delete(
        config: MetadataConfig,
        db: DbD2,
        dataSets: DataSetWithOrgUnits[]
    ): Promise<Response<{ level: string; message: string }>> {
        const modelReferencesToDelete = await this.getResources(config, db, dataSets);
        const dataSetsWithDataValues = _.compact(
            await promiseMap(dataSets, dataSet => {
                return Campaign.hasDataValues(db, config, dataSet).then(hasDataValues =>
                    hasDataValues ? dataSet : null
                );
            })
        );

        // If we try to delete all objects all at once, we get this error from the /metadata endpoint:
        // "Could not delete due to association with another object: CategoryDimension"
        // It does work, however, if we delete the objects in this order:
        // 1) Dashboards, 2) Everything else except Category options 3) Category options (teams),
        const keys = ["dashboards", "other", "teams"];

        const referencesGroups = _(modelReferencesToDelete)
            .groupBy(({ model }) => {
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
            .value();

        const results: Array<[string, ApiResponse<MetadataResponse>]> = await promiseMap(
            referencesGroups,
            async ([key, references]) => {
                const metadata = _(references)
                    .groupBy("model")
                    .mapValues(groups => groups.map(group => ({ id: group.id })))
                    .value();
                const response = await db.postMetadata(metadata, { importStrategy: "DELETE" });
                return [key, toStatusResponse(response)] as [string, ApiResponse<MetadataResponse>];
            }
        );

        const [keysWithErrors, errors] = _(results)
            .map(([key, result]) => (result.status ? null : [key, result.error]))
            .compact()
            .unzip()
            .value();

        const sendNotification = () => {
            const notification = new CampaignNotification(db);
            return notification.sendOnUpdateOrDelete(dataSetsWithDataValues, "delete");
        };

        if (_.isEmpty(keysWithErrors)) {
            sendNotification();
            return { status: true };
        } else if (_.isEqual(keysWithErrors, ["teams"])) {
            sendNotification();
            return {
                status: false,
                error: {
                    level: "warning",
                    message: i18n.t(
                        "Campaign teams (category options) could not be deleted, probably there are associated data values"
                    ),
                },
            };
        } else {
            return { status: false, error: { level: "error", message: errors.join("\n") } };
        }
    }

    public async validate(
        validationKeys: Maybe<string[]> = undefined
    ): Promise<Dictionary<ValidationErrors>> {
        const obj = _(this.validations)
            .pickBy((_value, key) => !validationKeys || _(validationKeys).includes(key))
            .mapValues(fn => (fn ? fn.call(this) : []))
            .value();
        const [keys, promises] = _.unzip(_.toPairs(obj));
        const values = await Promise.all(promises as Promise<ValidationErrors>[]);
        return _.fromPairs(_.zip(keys, values));
    }

    validateStartDate(): ValidationErrors {
        return !this.data.startDate ? getError("cannot_be_blank", { field: "start date" }) : [];
    }

    validateEndDate(): ValidationErrors {
        return !this.data.endDate ? getError("cannot_be_blank", { field: "end date" }) : [];
    }

    validateTeams(): ValidationErrors {
        const { teams } = this.data;
        return _.compact([
            !teams ? getError("cannot_be_blank", { field: "teams" })[0] : null,
            teams && teams <= 0 ? getError("must_be_bigger_than_zero")[0] : null,
            teams && teams > 999 ? getError("must_be_smaller_than", { value: "1000" })[0] : null,
        ]);
    }

    /* Organisation units */

    private async validateOrganisationUnits() {
        const { organisationUnits } = this.data;

        const allOrgUnitsInAcceptedLevels = _(organisationUnits).every(ou =>
            _(this.selectableLevels).includes(
                _(ou.path)
                    .countBy()
                    .get("/") || 0
            )
        );
        const levels = this.selectableLevels.join("/");

        const errorsList = [
            !allOrgUnitsInAcceptedLevels
                ? getError("organisation_units_only_of_levels", { levels })
                : [],
            _(organisationUnits).isEmpty() ? getError("no_organisation_units_selected") : [],
        ];

        return _(errorsList)
            .flatten()
            .compact()
            .value();
    }

    public async getOrganisationUnitsWithName(): Promise<PaginatedObjects<OrganisationUnit>> {
        const ids = this.data.organisationUnits.map(ou => ou.id);
        return this.db.getOrganisationUnitsFromIds(ids, { pageSize: 100 });
    }

    public setOrganisationUnits(organisationUnits: OrganisationUnitPathOnly[]): Campaign {
        // Use orgUnits only with id/path, that's the only info we get from a orgunit-tree
        return this.update({ ...this.data, organisationUnits });
    }

    public get organisationUnits(): OrganisationUnitPathOnly[] {
        return this.data.organisationUnits;
    }

    public get id(): Maybe<string> {
        return this.data.id;
    }

    /* Name */

    public setName(name: string): Campaign {
        return this.update({ ...this.data, name });
    }

    public get name(): string {
        return this.data.name;
    }

    public async existsCampaignWithSameName(name: string): Promise<boolean> {
        const { id } = this.data;
        const nameLowerCase = name.trim().toLowerCase();

        const { dataSets } = await this.db.getMetadata<{
            dataSets: Array<{ id: string; name: string }>;
        }>({
            dataSets: {
                fields: { id: true, name: true },
                filters: [`name:$ilike:${nameLowerCase}`],
            },
        });

        return dataSets.some(ds => ds.id !== id && ds.name.toLowerCase() === nameLowerCase);
    }

    private async validateName(): Promise<ValidationErrors> {
        const { maxNameLength } = this;
        const { name } = this.data;
        const trimmedName = name.trim();

        if (!trimmedName) {
            return getError("cannot_be_blank", { field: i18n.t("Name") });
        } else if (trimmedName.length > maxNameLength) {
            return getError("too_long", { field: i18n.t("Name"), n: maxNameLength.toString() });
        } else if (await this.existsCampaignWithSameName(trimmedName)) {
            return getError("name_must_be_unique");
        } else {
            return [];
        }
    }

    /* Description */

    public setDescription(description: string): Campaign {
        return this.update({ ...this.data, description });
    }

    public get description(): string {
        return this.data.description;
    }

    /* Period dates */

    public setStartDate(startDate: Date | null): Campaign {
        return this.update({ ...this.data, startDate });
    }

    public get startDate(): Date | null {
        return this.data.startDate;
    }

    public setEndDate(endDate: Date | null): Campaign {
        return this.update({ ...this.data, endDate });
    }

    public get endDate(): Date | null {
        return this.data.endDate;
    }

    /* Antigens */

    public setAntigens(antigens: Antigen[]): Campaign {
        const { antigensDisaggregation } = this.data;
        return this.update({
            ...this.data,
            antigens,
            antigensDisaggregation: antigensDisaggregation.setAntigens(antigens),
        });
    }

    public get antigens(): Antigen[] {
        return this.data.antigens;
    }

    public get antigenCodes(): string[] {
        return this.antigens.map(antigen => antigen.code);
    }

    public getAvailableAntigens(): Antigen[] {
        return this.config.antigens;
    }

    validateAntigens(): ValidationErrors {
        return _(this.data.antigens).isEmpty() ? getError("no_antigens_selected") : [];
    }

    /* Antigens disaggregation */

    public get antigensDisaggregation(): AntigensDisaggregation {
        return this.data.antigensDisaggregation;
    }

    public setAntigensDisaggregation(antigensDisaggregation: AntigensDisaggregation): Campaign {
        return this.update({ ...this.data, antigensDisaggregation });
    }

    public getEnabledAntigensDisaggregation(): AntigenDisaggregationEnabled {
        return this.antigensDisaggregation.getEnabled();
    }

    validateAntigensDisaggregation(): ValidationErrors {
        return this.data.antigensDisaggregation.validate();
    }

    /* Target population */

    public async saveTargetPopulation(): Promise<Response<string>> {
        const campaignDb = new CampaignDb(this);
        return campaignDb.saveTargetPopulation();
    }

    public get targetPopulation(): Maybe<TargetPopulation> {
        return this.data.targetPopulation;
    }

    public setTargetPopulation(targetPopulation: TargetPopulation): Campaign {
        return this.update({ ...this.data, targetPopulation });
    }

    public async withTargetPopulation(): Promise<Campaign> {
        const targetPopulation = this.data.targetPopulation || TargetPopulation.build(this);

        const targetPopulationForCampaign = await targetPopulation.update(
            this.organisationUnits,
            this.getEnabledAntigensDisaggregation(),
            this.startDate ? moment(this.startDate).format("YYYYMMDD") : "TODAY"
        );

        return this.update({
            ...this.data,
            targetPopulation: targetPopulationForCampaign,
        });
    }

    validateTargetPopulation(): ValidationErrors {
        const { targetPopulation } = this.data;
        return !targetPopulation
            ? getError("no_target_population_defined")
            : targetPopulation.validate();
    }

    /* Data set */

    public async getDataSetSharing(): Promise<Sharing> {
        return new CampaignSharing(this).forDataSet();
    }

    public getDataSet(): DataSetWithOrgUnits {
        return {
            id: this.id,
            name: this.name,
            organisationUnits: this.organisationUnits.map(ou => ({ id: ou.id })),
        };
    }

    public async hasDataValues(): Promise<boolean> {
        return Campaign.hasDataValues(this.db, this.config, this.getDataSet());
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

    /* Dashboard */

    public get dashboardId(): Maybe<string> {
        return this.data.dashboardId;
    }

    public async createDashboard(): Promise<Maybe<string>> {
        return new CampaignDb(this).createDashboard();
    }

    public async getDashboardSharing(): Promise<Sharing> {
        return new CampaignSharing(this).forDashboard();
    }

    /* Teams */

    public get teams(): Maybe<number> {
        return this.data.teams;
    }

    public setTeams(teams: number): Campaign {
        return this.update({ ...this.data, teams });
    }

    public get teamsMetadata(): TeamsMetadata {
        return this.data.teamsMetadata;
    }

    /* Save */

    isEdit(): boolean {
        return !!this.id;
    }

    public async save(): Promise<Response<string>> {
        const campaignDb = new CampaignDb(this);
        const saveResponse = await campaignDb.save();
        this.notifyOnUpdateIfData();
        return saveResponse;
    }

    public async reload(): Promise<Maybe<Campaign>> {
        return this.id ? Campaign.get(this.config, this.db, this.id) : undefined;
    }

    public static async getResources(
        config: MetadataConfig,
        db: DbD2,
        dataSets: DataSetWithOrgUnits[]
    ) {
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
