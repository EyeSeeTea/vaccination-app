import { OrganisationUnit, Maybe } from "./db.types";
///<reference path="../types/d2.d.ts" />
import { DataSetCustomForm } from "./DataSetCustomForm";
import _, { Dictionary } from "lodash";
import moment from "moment";

import { AntigensDisaggregation } from "./AntigensDisaggregation";
import { MetadataResponse, DataEntryForm } from "./db.types";
import { generateUid } from "d2/uid";
import { DataSet, Response } from "./db.types";
import { PaginatedObjects, OrganisationUnitPathOnly } from "./db.types";
import DbD2 from "./db-d2";
import { getDaysRange } from "../utils/date";
import { MetadataConfig } from "./config";
import { AntigenDisaggregationEnabled, getDataElements } from "./AntigensDisaggregation";
import { TargetPopulation, TargetPopulationData } from "./TargetPopulation";

export type TargetPopulationData = TargetPopulationData;

export interface Antigen {
    name: string;
    code: string;
}

export interface Data {
    name: string;
    organisationUnits: OrganisationUnitPathOnly[];
    startDate: Date | null;
    endDate: Date | null;
    antigens: Antigen[];
    antigensDisaggregation: AntigensDisaggregation;
    targetPopulation: Maybe<TargetPopulation>;
}

function getError(key: string, namespace: Maybe<Dictionary<string>> = undefined) {
    return namespace ? [{ key, namespace }] : [{ key }];
}

export default class Campaign {
    public selectableLevels: number[] = [5];

    constructor(private db: DbD2, public config: MetadataConfig, private data: Data) {}

    public static create(config: MetadataConfig, db: DbD2): Campaign {
        const antigens: Antigen[] = [];
        const organisationUnits: OrganisationUnit[] = [];

        const initialData = {
            name: "",
            organisationUnits: organisationUnits,
            startDate: null,
            endDate: null,
            antigens: antigens,
            antigensDisaggregation: AntigensDisaggregation.build(config, antigens),
            targetPopulation: undefined,
        };

        return new Campaign(db, config, initialData);
    }

    public update(newData: Data) {
        return new Campaign(this.db, this.config, newData);
    }

    public validate() {
        const {
            name,
            startDate,
            endDate,
            antigens,
            targetPopulation,
            antigensDisaggregation,
        } = this.data;

        const validation = {
            name: !name.trim() ? getError("cannot_be_blank", { field: "name" }) : [],

            startDate:
                !startDate && endDate
                    ? getError("cannot_be_blank_if_other_set", {
                          field: "startDate",
                          other: "endDate",
                      })
                    : [],

            organisationUnits: this.validateOrganisationUnits(),

            antigens: _(antigens).isEmpty() ? getError("no_antigens_selected") : [],

            targetPopulation: !targetPopulation
                ? getError("no_target_population_defined")
                : targetPopulation.validate(),

            antigensDisaggregation: antigensDisaggregation.validate(),
        };

        return validation;
    }

    /* Organisation units */

    private validateOrganisationUnits() {
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

    public async validateTeamsForOrganisationUnits(organisationUnits: OrganisationUnitPathOnly[]) {
        if (_.isEmpty(organisationUnits)) return;
        return this.db.validateTeamsForOrganisationUnits(organisationUnits);
    }

    /* Name */

    public setName(name: string): Campaign {
        return this.update({ ...this.data, name });
    }

    public get name(): string {
        return this.data.name;
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

    /* Target population */

    public get targetPopulation(): Maybe<TargetPopulation> {
        return this.data.targetPopulation;
    }

    public setTargetPopulation(targetPopulation: TargetPopulation): Campaign {
        return this.update({ ...this.data, targetPopulation });
    }

    public async withTargetPopulation(): Promise<Campaign> {
        const targetPopulation =
            this.data.targetPopulation || TargetPopulation.build(this.config, this.db);

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

    /* Save */

    public async save(): Promise<Response<string>> {
        const dataSetId = generateUid();
        const metadataConfig = this.config;
        const { categoryComboCodeForTeams, categoryCodeForTeams } = metadataConfig;
        const vaccinationAttribute = await this.db.getAttributeIdByCode(
            metadataConfig.attibuteCodeForApp
        );
        const dashboardAttribute = await this.db.getAttributeIdByCode(
            metadataConfig.attributeCodeForDashboard
        );
        const categoryCombos = await this.db.getCategoryCombosByCode([categoryComboCodeForTeams]);
        const categoryCombosByCode = _(categoryCombos)
            .keyBy("code")
            .value();
        const categoryComboTeams = _(categoryCombosByCode).get(categoryComboCodeForTeams);

        const { dashboard, charts, reportTables } = await this.db.createDashboard(
            this.name,
            this.organisationUnits,
            this.antigens,
            this.startDate,
            this.endDate,
            categoryCodeForTeams
        );

        const { targetPopulation } = this.data;

        if (!vaccinationAttribute || !dashboardAttribute) {
            return { status: false, error: "Metadata not found: Attributes" };
        } else if (!categoryComboTeams) {
            return {
                status: false,
                error: `Metadata not found: categoryCombo.code=${categoryComboCodeForTeams}`,
            };
        } else if (!dashboard) {
            return { status: false, error: "Error creating dashboard" };
        } else if (!targetPopulation) {
            return { status: false, error: "There is no target population in campaign" };
        } else {
            const disaggregationData = this.getEnabledAntigensDisaggregation();
            const dataElements = await getDataElements(this.db, disaggregationData);

            const dataSetElements = dataElements.map(dataElement => ({
                dataSet: { id: dataSetId },
                dataElement: { id: dataElement.id },
                categoryCombo: { id: dataElement.categoryCombo.id },
            }));

            const toMoment = (date: Date | null) => (date ? moment(date) : null);
            const startDate = toMoment(this.startDate);
            const endDate =
                !this.endDate && this.startDate ? moment().endOf("year") : toMoment(this.endDate);

            const dataInputPeriods = getDaysRange(startDate, endDate).map(date => ({
                openingDate: this.startDate ? this.startDate.toISOString() : undefined,
                closingDate: endDate ? endDate.toISOString() : undefined,
                period: { id: date.format("YYYYMMDD") },
            }));

            const customForm = await DataSetCustomForm.build(this);
            const customFormHtml = customForm.generate();
            const dataEntryForm: DataEntryForm = {
                id: generateUid(),
                name: this.name,
                htmlCode: customFormHtml,
                style: "NONE",
            };

            const dataSet: DataSet = {
                id: dataSetId,
                name: this.name,
                publicAccess: "r-r-----", // Metadata can view-only, Data can view-only
                periodType: "Daily",
                categoryCombo: { id: categoryComboTeams.id },
                dataElementDecoration: true,
                renderAsTabs: true,
                organisationUnits: this.organisationUnits.map(ou => ({ id: ou.id })),
                dataSetElements,
                openFuturePeriods: 1,
                timelyDays: 0,
                expiryDays: 0,
                formType: "CUSTOM",
                dataInputPeriods,
                attributeValues: [
                    { value: "true", attribute: { id: vaccinationAttribute.id } },
                    { value: dashboard.id, attribute: { id: dashboardAttribute.id } },
                ],
            };

            const period = moment(this.startDate || new Date()).format("YYYYMMDD");
            const dataValues = targetPopulation.getDataValues(period);
            const populationResult = await this.db.postDataValues(dataValues);

            if (!populationResult.status) {
                return {
                    status: false,
                    error: JSON.stringify(populationResult.error, null, 2),
                };
            } else {
                const result: MetadataResponse = await this.db.postMetadata({
                    charts,
                    reportTables,
                    dashboards: [dashboard],
                    dataSets: [dataSet],
                });

                if (result.status !== "OK") {
                    return { status: false, error: JSON.stringify(result.typeReports, null, 2) };
                } else {
                    await this.db.postForm(dataSetId, dataEntryForm);
                    return { status: true };
                }
            }
        }
    }
}
