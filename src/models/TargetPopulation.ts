import _ from "lodash";
const fp = require("lodash/fp");
import moment from "moment";

import DbD2 from "./db-d2";
import { MetadataConfig } from "./config";
import { Maybe, DataValue } from "./db.types";
import { OrganisationUnit, OrganisationUnitPathOnly, OrganisationUnitLevel } from "./db.types";
import { AntigenDisaggregationEnabled } from "./AntigensDisaggregation";
import { sortAgeGroups } from "../utils/age-groups";
import Campaign from "./campaign";
import { getDaysRange } from "../utils/date";

const dailyPeriodFormat = "YYYYMMDD";

const levelsConfig = {
    areaLevel: 4,
    levelForPopulation: 6,
    levelsForAgeDistribution: [{ level: 4, isEditable: true }, { level: 6, isEditable: true }],
};

export type PopulationItems = { [id: string]: TargetPopulationItem };

export type AgeDistributionByOrgUnit = { [orgUnitId: string]: AgeDistribution };

export type TargetPopulationData = {
    organisationUnitLevels: OrganisationUnitLevel[];
    antigensDisaggregation: AntigenDisaggregationEnabled;
    populationItems: PopulationItems;
    ageGroups: string[];
    ageDistributionByOrgUnit: AgeDistributionByOrgUnit;
};

interface AgeDistribution {
    [ageGroup: string]: Maybe<number>;
}

type PopulationTotal = {
    organisationUnit: OrganisationUnit;
    value: Maybe<number>;
};

export type PopulationDistribution = {
    isEditable: boolean;
    organisationUnit: OrganisationUnit;
};

export interface TargetPopulationItem {
    organisationUnit: OrganisationUnit;
    organisationUnitArea: OrganisationUnit;
    populationTotal: PopulationTotal;
    populationDistributions: PopulationDistribution[];
}

export interface AgeGroupSelector {
    orgUnitIds: string[];
    ageGroup: string;
}

export class TargetPopulation {
    private config: MetadataConfig;
    private db: DbD2;

    constructor(public campaign: Campaign, public data: TargetPopulationData) {
        this.db = campaign.db;
        this.config = campaign.config;
    }

    static build(campaign: Campaign): TargetPopulation {
        return new TargetPopulation(campaign, {
            organisationUnitLevels: campaign.config.organisationUnitLevels,
            populationItems: {},
            antigensDisaggregation: [],
            ageGroups: [],
            ageDistributionByOrgUnit: {},
        });
    }

    get antigensDisaggregation() {
        return this.data.antigensDisaggregation;
    }

    public validate(): Array<{ key: string; namespace: _.Dictionary<string> }> {
        const totalPopulationValidations = _.map(this.data.populationItems, targetPopOu => {
            const value = targetPopOu.populationTotal.value;
            return _.isUndefined(value) || _.isNaN(value) || value <= 0
                ? {
                      key: "total_population_invalid",
                      namespace: {
                          organisationUnit: targetPopOu.organisationUnit.displayName,
                          value: (value || "-").toString(),
                      },
                  }
                : null;
        });

        const ageGroupPopulationValidations = _.map(this.data.populationItems, targetPopOu => {
            const finalPopulationDistribution = this.getFinalDistribution(targetPopOu);

            const ageGroupsInvalid = this.data.ageGroups.filter(ageGroup => {
                const value = finalPopulationDistribution[ageGroup];
                return _.isUndefined(value) || _.isNaN(value) || value < 0 || value > 100;
            });

            return _(ageGroupsInvalid).isEmpty()
                ? null
                : {
                      key: "age_groups_population_invalid",
                      namespace: {
                          ageGroups: ageGroupsInvalid.join(", "),
                          organisationUnit: targetPopOu.organisationUnit.displayName,
                      },
                  };
        });

        const ageGroupAntigensValidations = _.flatMap(this.data.populationItems, targetPopOu => {
            const finalPopulationDistribution = this.getFinalDistribution(targetPopOu);

            return this.data.antigensDisaggregation.map(antigen => {
                const sumForAntigenAgeGroups = _(antigen.ageGroups)
                    .map(ageGroup => finalPopulationDistribution[ageGroup] || 0)
                    .sum();

                return sumForAntigenAgeGroups > 100
                    ? {
                          key: "age_groups_population_for_antigen_invalid",
                          namespace: {
                              organisationUnit: targetPopOu.organisationUnit.displayName,
                              antigen: antigen.antigen.name,
                              ageGroups: antigen.ageGroups.join(" + "),
                              value: `${sumForAntigenAgeGroups}% > 100%`,
                          },
                          name,
                      }
                    : null;
            });
        });

        return _([
            ...totalPopulationValidations,
            ...ageGroupPopulationValidations,
            ...ageGroupAntigensValidations,
        ])
            .compact()
            .value();
    }

    public async update(
        orgUnitsPathOnly: OrganisationUnitPathOnly[],
        antigensDisaggregation: AntigenDisaggregationEnabled,
        period: string
    ): Promise<TargetPopulation> {
        const ouIds = _.uniq(_.flatMap(orgUnitsPathOnly, ou => ou.path.split("/")));
        const ageGroupsForAllAntigens = sortAgeGroups(
            this.config,
            _(antigensDisaggregation)
                .flatMap(({ ageGroups }) => ageGroups)
                .uniq()
                .value()
        );

        const { organisationUnits: ousInHierarchy } = await this.db.getMetadata<{
            organisationUnits: OrganisationUnit[];
        }>({
            organisationUnits: { filters: [`id:in:[${ouIds}]`] },
        });

        const ousInHierarchyById = _.keyBy(ousInHierarchy, ou => ou.id);
        const organisationUnits = _.at(ousInHierarchyById, orgUnitsPathOnly.map(ou => ou.id));

        const totalPopulationsByOrgUnit = await this.getTotalPopulation(organisationUnits, period);

        const {
            populationDistributionsByOrgUnit,
            ageDistributionByOrgUnit,
        } = await this.getPopulationData(organisationUnits, ageGroupsForAllAntigens, period);

        const populationItems: PopulationItems = _.fromPairs(
            organisationUnits.map(orgUnit => {
                const populationTotal = _(totalPopulationsByOrgUnit).get(orgUnit.id);
                const areaId = _(orgUnit.ancestors || [])
                    .keyBy(ou => ou.level)
                    .getOrFail(levelsConfig.areaLevel).id;
                const organisationUnitArea = _(ousInHierarchyById).getOrFail(areaId);

                const item = {
                    organisationUnit: orgUnit,
                    organisationUnitArea,
                    populationTotal,
                    populationDistributions: _(populationDistributionsByOrgUnit).get(orgUnit.id),
                };
                return [orgUnit.id, item];
            })
        );

        return new TargetPopulation(this.campaign, {
            ...this.data,
            antigensDisaggregation,
            populationItems: populationItems,
            ageGroups: ageGroupsForAllAntigens,
            ageDistributionByOrgUnit,
        });
    }

    setTotalPopulation(ouId: string, value: number) {
        const path = ["populationItems", ouId, "populationTotal", "value"];
        const newData = fp.set(path, value, this.data);
        return new TargetPopulation(this.campaign, newData);
    }

    setAgeGroupPopulation(selector: AgeGroupSelector, value: number) {
        const newData = _.reduce(
            selector.orgUnitIds,
            (currentData, orgUnitId) => {
                const path = ["ageDistributionByOrgUnit", orgUnitId, selector.ageGroup];
                return fp.set(path, value, currentData);
            },
            this.data
        );
        return new TargetPopulation(this.campaign, newData);
    }

    public get ageGroups() {
        return this.data.ageGroups;
    }

    public get organisationUnitLevels() {
        return this.data.organisationUnitLevels;
    }

    public get populationItems(): PopulationItems {
        return this.data.populationItems;
    }

    public get ageDistributionByOrgUnit(): AgeDistributionByOrgUnit {
        return this.data.ageDistributionByOrgUnit;
    }

    public async areDataValuesUpTodate(): Promise<boolean> {
        const { config, campaign } = this;
        if (!campaign.id) return false;

        const isPopulationByAge = (dataValue: DataValue) =>
            dataValue.dataElement === config.population.populationByAgeDataElement.id;

        // getDataValues() will only succeed if all required fields are present, fallback to empty
        const expectedDataValues = await this.getDataValues().catch(_err => [] as DataValue[]);

        const actualDataValues = await this.db.getDataValues({
            dataElementGroup: [config.population.dataElementGroup.id],
            orgUnit: campaign.organisationUnits.map(ou => ou.id),
            startDate: campaign.startDate || undefined,
            endDate: campaign.endDate || undefined,
        });

        const filterAndSortDataValues = (dataValues: DataValue[]) =>
            _(dataValues)
                .filter(isPopulationByAge)
                .map(dv => [dv.period, dv.orgUnit, dv.categoryOptionCombo, dv.value].join("-"))
                .sortBy()
                .value();

        const expected = filterAndSortDataValues(expectedDataValues);
        const actual = filterAndSortDataValues(actualDataValues);

        return _.isEqual(expected, actual);
    }

    public async getDataValues(): Promise<DataValue[]> {
        const { config, campaign } = this;
        const { antigensDisaggregation } = this.data;
        const { cocIdByName } = await this.campaign.antigensDisaggregation.getCocMetadata(this.db);
        const startPeriod = moment(campaign.startDate || new Date()).format(dailyPeriodFormat);
        const periods = getDaysRange(
            moment(campaign.startDate || undefined),
            moment(campaign.endDate || undefined)
        ).map(day => day.format(dailyPeriodFormat));
        const populationByAgeDataElementId = config.population.populationByAgeDataElement.id;

        const dataValues = _.flatMap(this.data.populationItems, targetPopulationItem => {
            const orgUnitId = targetPopulationItem.organisationUnit.id;
            const totalPopulation = get(
                targetPopulationItem.populationTotal.value,
                "No value for total population"
            );
            const newValue = targetPopulationItem.populationTotal.value;
            const totalPopulationDataValues = _.isUndefined(newValue)
                ? []
                : [
                      {
                          period: startPeriod,
                          orgUnit: targetPopulationItem.populationTotal.organisationUnit.id,
                          dataElement: config.population.totalPopulationDataElement.id,
                          value: newValue.toString(),
                      },
                  ];

            const finalDistribution = this.getFinalDistribution(targetPopulationItem);

            const populationByAgeDataValues = _.flatMap(config.antigens, antigen => {
                const ageGroupsForAntigen = _(antigen.ageGroups)
                    .flatten()
                    .flatten()
                    .uniq()
                    .value();
                const antigenDisaggregation = antigensDisaggregation.find(
                    disaggregation => disaggregation.antigen.id == antigen.id
                );
                return _.flatMap(ageGroupsForAntigen, ageGroup => {
                    return _.flatMap(antigen.doses, dose => {
                        const cocName = [antigen.name, dose.name, ageGroup].join(", ");

                        const ageGroupInPopulation =
                            antigenDisaggregation &&
                            _(antigenDisaggregation.ageGroups).includes(ageGroup);

                        let populationForAgeRange: number;
                        if (ageGroupInPopulation) {
                            const percentageForAgeRange = get(
                                _(finalDistribution).getOrFail(ageGroup),
                                `Value for age range not found: ${ageGroup}`
                            );
                            populationForAgeRange = (totalPopulation * percentageForAgeRange) / 100;
                        } else {
                            populationForAgeRange = 0;
                        }

                        return periods.map(period => {
                            return {
                                period: period,
                                orgUnit: orgUnitId,
                                dataElement: populationByAgeDataElementId,
                                categoryOptionCombo: _(cocIdByName).getOrFail(cocName),
                                value: populationForAgeRange.toFixed(2),
                            };
                        });
                    });
                });
            });

            const { ageGroups, ageDistributionByOrgUnit } = this.data;
            const ageDistributionDataValues = _.flatMap(
                targetPopulationItem.populationDistributions,
                populationDistribution => {
                    return _(ageGroups)
                        .map(ageGroup => {
                            const ouId = populationDistribution.organisationUnit.id;
                            const value = _(ageDistributionByOrgUnit).getOrFail(ouId)[ageGroup];
                            return value
                                ? {
                                      period: startPeriod,
                                      orgUnit: ouId,
                                      dataElement: config.population.ageDistributionDataElement.id,
                                      categoryOptionCombo: _(cocIdByName).getOrFail(ageGroup),
                                      value: value.toString(),
                                  }
                                : null;
                        })
                        .compact()
                        .value();
                }
            );

            return _.concat(
                totalPopulationDataValues,
                ageDistributionDataValues,
                populationByAgeDataValues
            );
        });

        return dataValues;
    }

    private async getTotalPopulation(
        organisationUnits: OrganisationUnit[],
        period: string
    ): Promise<{ [ouId: string]: PopulationTotal }> {
        const organisationUnitsForTotalPopulation: { [ouId: string]: OrganisationUnit } = _(
            organisationUnits
        )
            .map(orgUnit => {
                const ouForTotalPopulation = _(orgUnit.ancestors || [])
                    .concat([orgUnit])
                    .find(ou => ou.level == levelsConfig.levelForPopulation);
                if (!ouForTotalPopulation)
                    throw new Error(`No ancestor found for orgUnit: ${orgUnit.id}`);
                return [orgUnit.id, ouForTotalPopulation];
            })
            .fromPairs()
            .value();

        const { headers, rows } = await this.db.getAnalytics({
            dimension: [
                "dx:" + this.config.population.totalPopulationDataElement.id,
                "pe:" + period,
                "ou:" +
                    _(organisationUnitsForTotalPopulation)
                        .values()
                        .map(ou => ou.id)
                        .join(";"),
            ],
        });

        const rowByOrgUnit = _(rows)
            .map(row =>
                _(headers)
                    .map("name")
                    .zip(row)
                    .fromPairs()
                    .value()
            )
            .keyBy("ou")
            .value();

        const existing = _.keyBy(this.data.populationItems, tp => tp.organisationUnit.id);

        return _.mapValues(organisationUnitsForTotalPopulation, (ou, ouIdForPopulation) => {
            const strOldValue = _(rowByOrgUnit).get([ou.id, "value"]);
            const oldValue = strOldValue ? parseInt(strOldValue) : undefined;
            const prevValue = !_(existing).has(ouIdForPopulation)
                ? undefined
                : existing[ouIdForPopulation].populationTotal.value;
            return {
                organisationUnit: ou,
                value: oldValue || prevValue,
            };
        });
    }

    private async getPopulationData(
        organisationUnits: OrganisationUnit[],
        ageGroupsForAllAntigens: string[],
        period: string
    ): Promise<{
        populationDistributionsByOrgUnit: { [orgUnitId: string]: PopulationDistribution[] };
        ageDistributionByOrgUnit: AgeDistributionByOrgUnit;
    }> {
        const orgUnitsForAgeDistribution: { [ouId: string]: OrganisationUnit[] } = _(
            organisationUnits
        )
            .map(orgUnit => {
                const ousForAgeDistribution = (orgUnit.ancestors || [])
                    .concat([orgUnit])
                    .filter(ancestorOu =>
                        _(levelsConfig.levelsForAgeDistribution)
                            .map("level")
                            .includes(ancestorOu.level)
                    );
                if (_(ousForAgeDistribution).isEmpty())
                    throw new Error(`No org units for age distribution found: ou=${orgUnit.id}`);
                return [orgUnit.id, ousForAgeDistribution];
            })
            .fromPairs()
            .value();

        const { ageGroupCategory, ageDistributionDataElement } = this.config.population;

        const { headers, rows } = await this.db.getAnalytics({
            dimension: [
                "dx:" + ageDistributionDataElement.id,
                ageGroupCategory.id,
                "pe:" + period,
                "ou:" +
                    _(orgUnitsForAgeDistribution)
                        .values()
                        .flatten()
                        .map("id")
                        .join(";"),
            ],
            skipRounding: true,
        });

        const rowsByOrgUnit = _(rows)
            .map(row =>
                _(headers)
                    .map("name")
                    .zip(row)
                    .fromPairs()
                    .value()
            )
            .groupBy("ou")
            .value();

        const ageGroupCategoryOptionById = _.keyBy(ageGroupCategory.categoryOptions, "id");

        const populationDistributionsByOrgUnit = _.mapValues(orgUnitsForAgeDistribution, ous =>
            ous.map(ou => {
                const isEditableByLevel = _(levelsConfig.levelsForAgeDistribution)
                    .keyBy("level")
                    .mapValues("isEditable");

                return {
                    isEditable: isEditableByLevel.getOrFail(ou.level),
                    organisationUnit: ou,
                };
            })
        );

        const distByOrgUnit = this.data.ageDistributionByOrgUnit;

        const ageDistributionByOrgUnit = _(orgUnitsForAgeDistribution)
            .values()
            .flatten()
            .uniqBy("id")
            .map(orgUnit => {
                const rows = _(rowsByOrgUnit).get(orgUnit.id);
                const ageDistribution = _(rows)
                    .map(row => {
                        const ageGroupCategoryOptionId = _(row).getOrFail(ageGroupCategory.id);
                        const categoryOption = _(ageGroupCategoryOptionById).getOrFail(
                            ageGroupCategoryOptionId
                        );
                        return [categoryOption.displayName, parseFloat(row.value)];
                    })
                    .fromPairs()
                    .value();

                const ageDistributionWithAllAgeGroups = _(ageGroupsForAllAntigens)
                    .map(ageGroup => {
                        const newValueExisting =
                            distByOrgUnit[orgUnit.id] && distByOrgUnit[orgUnit.id][ageGroup]
                                ? distByOrgUnit[orgUnit.id][ageGroup]
                                : undefined;
                        const oldValue = _(ageDistribution).get(ageGroup);
                        return [ageGroup, oldValue || newValueExisting];
                    })
                    .fromPairs()
                    .value();

                return [orgUnit.id, ageDistributionWithAllAgeGroups];
            })
            .fromPairs()
            .value();

        return { populationDistributionsByOrgUnit, ageDistributionByOrgUnit };
    }

    public getFinalDistribution(
        targetPopOu: TargetPopulationItem
    ): { [ageGroup: string]: Maybe<number> } {
        const { ageGroups, ageDistributionByOrgUnit } = this;

        return _(ageGroups)
            .map(ageGroup => [
                ageGroup,
                _(targetPopOu.populationDistributions)
                    .map(distribution =>
                        _(ageDistributionByOrgUnit).get([
                            distribution.organisationUnit.id,
                            ageGroup,
                        ])
                    )
                    .reject(x => _.isUndefined(x) || _.isNaN(x))
                    .last(),
            ])
            .fromPairs()
            .value();
    }
}

function get<T>(value: Maybe<T>, errorMsg: string): T {
    if (_.isUndefined(value)) {
        throw new Error(errorMsg);
    } else {
        return value;
    }
}

export function groupTargetPopulationByArea(
    targetPopulation: TargetPopulation
): Array<{ area: OrganisationUnit; items: TargetPopulationItem[] }> {
    return _(targetPopulation.populationItems)
        .groupBy(targetPopulation => targetPopulation.organisationUnitArea.id)
        .values()
        .map(items => ({ area: items[0].organisationUnitArea, items }))
        .sortBy(({ area }) => area.displayName)
        .value();
}
