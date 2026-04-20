import _ from "lodash";
import moment from "moment";

import DbD2 from "./db-d2";
import { MetadataConfig } from "./config";
import { Maybe, CategoryOption } from "./db.types";
import { OrganisationUnitPathOnly, OrganisationUnitLevel } from "./db.types";
import { OrganisationUnit, OrganisationUnitAttrs } from "../domain/entities/OrganisationUnit";
import { AntigenDisaggregationEnabled } from "./AntigensDisaggregation";
import { sortAgeGroups } from "../utils/age-groups";
import Campaign from "./campaign";

import fp from "lodash/fp";

const levelsConfig = {
    areaLevel: 4,
    levelForPopulation: 6,
    levelsForAgeDistribution: [
        { level: 4, isEditable: true },
        { level: 6, isEditable: true },
    ],
};

export type PopulationItems = { [id: string]: TargetPopulationItem };

export type AgeDistributionByOrgUnit = { [orgUnitId: string]: AgeDistribution };

export type TargetPopulationData = {
    organisationUnitLevels: OrganisationUnitLevel[];
    antigensDisaggregation: AntigenDisaggregationEnabled;
    populationItems: PopulationItems;
    ageGroups: CategoryOption[];
    ageDistributionByOrgUnit: AgeDistributionByOrgUnit;
    isPersisted: boolean;
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

    static build(campaign: Campaign): Promise<TargetPopulation> {
        const targetPopulation = new TargetPopulation(campaign, {
            organisationUnitLevels: campaign.config.organisationUnitLevels,
            populationItems: {},
            antigensDisaggregation: [],
            ageGroups: [],
            ageDistributionByOrgUnit: {},
            isPersisted: false,
        });

        return targetPopulation.update(
            campaign.organisationUnits,
            campaign.getEnabledAntigensDisaggregation(),
            campaign.startDate ? moment.utc(campaign.startDate).format("YYYYMMDD") : "TODAY"
        );
    }

    updateIsPersisted(value: boolean): TargetPopulation {
        const newData: TargetPopulationData = { ...this.data, isPersisted: value };
        return new TargetPopulation(this.campaign, newData);
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
                const value = finalPopulationDistribution[ageGroup.displayName];
                return _.isUndefined(value) || _.isNaN(value) || value < 0 || value > 100;
            });

            return _(ageGroupsInvalid).isEmpty()
                ? null
                : {
                      key: "age_groups_population_invalid",
                      namespace: {
                          ageGroups: ageGroupsInvalid.map(co => co.displayName).join(", "),
                          organisationUnit: targetPopOu.organisationUnit.displayName,
                      },
                  };
        });

        const ageGroupAntigensValidations = _.flatMap(this.data.populationItems, targetPopOu => {
            const finalPopulationDistribution = this.getFinalDistribution(targetPopOu);

            return this.data.antigensDisaggregation.map(antigen => {
                const sumForAntigenAgeGroups = _(antigen.ageGroups)
                    .map(ageGroup => finalPopulationDistribution[ageGroup.displayName] || 0)
                    .sum();

                return sumForAntigenAgeGroups > 100
                    ? {
                          key: "age_groups_population_for_antigen_invalid",
                          namespace: {
                              organisationUnit: targetPopOu.organisationUnit.displayName,
                              antigen: antigen.antigen.name,
                              ageGroups: antigen.ageGroups.map(co => co.displayName).join(" + "),
                              value: `${sumForAntigenAgeGroups}% > 100%`,
                          },
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
                .uniqBy(ageGroup => ageGroup.id)
                .value()
        );

        const { organisationUnits: ousInHierarchyRaw } = await this.db.getMetadata<{
            organisationUnits: OrganisationUnitAttrs[];
        }>({
            organisationUnits: { filters: [`id:in:[${ouIds}]`] },
        });
        const ousInHierarchy = ousInHierarchyRaw.map(ou => OrganisationUnit.create(ou));

        const ousInHierarchyById = _.keyBy(ousInHierarchy, ou => ou.id);
        const organisationUnits = _.at(
            ousInHierarchyById,
            orgUnitsPathOnly.map(ou => ou.id)
        );

        const totalPopulationsByOrgUnit = await this.getTotalPopulation(organisationUnits, period);

        const { populationDistributionsByOrgUnit, ageDistributionByOrgUnit } =
            await this.getPopulationData(organisationUnits, ageGroupsForAllAntigens, period);

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
            antigensDisaggregation: antigensDisaggregation,
            populationItems: populationItems,
            ageGroups: ageGroupsForAllAntigens,
            ageDistributionByOrgUnit: ageDistributionByOrgUnit,
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
                    .find(ou => ou.level === levelsConfig.levelForPopulation);
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
            .map(row => _(headers).map("name").zip(row).fromPairs().value())
            .keyBy("ou")
            .value();

        const existing = _.keyBy(this.data.populationItems, tp => tp.organisationUnit.id);

        return _.mapValues(organisationUnitsForTotalPopulation, (ou, ouIdForPopulation) => {
            const strOldValue = _(rowByOrgUnit).get([ou.id, "value"]);
            const oldValue = strOldValue ? parseInt(strOldValue) : undefined;
            const prevValue = !_(existing).has(ouIdForPopulation)
                ? undefined
                : existing[ouIdForPopulation]?.populationTotal.value;
            return {
                organisationUnit: ou,
                value: oldValue || prevValue,
            };
        });
    }

    private async getPopulationData(
        organisationUnits: OrganisationUnit[],
        ageGroupsForAllAntigens: CategoryOption[],
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
                        .map(ou => ou.id)
                        .join(";"),
            ],
            skipRounding: true,
        });

        const rowsByOrgUnit = _(rows)
            .map(row => _(headers).map("name").zip(row).fromPairs().value())
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
                            distByOrgUnit[orgUnit.id] &&
                            distByOrgUnit[orgUnit.id]?.[ageGroup.displayName]
                                ? distByOrgUnit[orgUnit.id]?.[ageGroup.displayName]
                                : undefined;
                        const oldValue = _(ageDistribution).get(ageGroup.displayName);
                        return [ageGroup.displayName, oldValue || newValueExisting];
                    })
                    .fromPairs()
                    .value();

                return [orgUnit.id, ageDistributionWithAllAgeGroups];
            })
            .fromPairs()
            .value();

        return { populationDistributionsByOrgUnit, ageDistributionByOrgUnit };
    }

    public getFinalDistribution(targetPopOu: TargetPopulationItem): {
        [ageGroup: string]: Maybe<number>;
    } {
        const { ageGroups, ageDistributionByOrgUnit } = this;

        return _(ageGroups)
            .map(ageGroup => [
                ageGroup.displayName,
                _(targetPopOu.populationDistributions)
                    .map(distribution =>
                        _(ageDistributionByOrgUnit).get([
                            distribution.organisationUnit.id,
                            ageGroup.displayName,
                        ])
                    )
                    .reject(x => _.isUndefined(x) || _.isNaN(x))
                    .last(),
            ])
            .fromPairs()
            .value();
    }
}

export function groupTargetPopulationByArea(
    targetPopulation: TargetPopulation
): Array<{ area: OrganisationUnit; items: TargetPopulationItem[] }> {
    return _(targetPopulation.populationItems)
        .groupBy(targetPopulation => targetPopulation.organisationUnitArea.id)
        .values()
        .map(items => {
            const item = items[0];
            return item ? { area: item.organisationUnitArea, items } : undefined;
        })
        .compact()
        .sortBy(({ area }) => area.displayName)
        .value();
}
