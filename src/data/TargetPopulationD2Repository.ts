import { TargetPopulationRepository } from "../domain/repositories/TargetPopulationRepository";
import _ from "lodash";
import Campaign from "../models/campaign";
import DbD2 from "../models/db-d2";
import { TargetPopulation } from "../models/TargetPopulation";
import { DataValue, Response } from "../models/db.types";
import { promiseMap } from "../utils/promises";
import { D2Api, DataValueSetsPostRequest } from "../types/d2-api";
import moment from "moment";
import { getDaysRange } from "../utils/date";
import { assert } from "../utils/assert";
import { isAgeGroupIncluded } from "../models/AntigensDisaggregation";
import { AntigenConfig, baseConfig, Dose } from "../models/config";
import { getDataElements } from "../models/D2CampaignMetadata";

export class TargetPopulationD2Repository implements TargetPopulationRepository {
    private d2Api: D2Api;

    constructor(private db: DbD2) {
        this.d2Api = db.d2Api;
    }

    async getForCampaign(campaign: Campaign): Promise<TargetPopulation> {
        const targetPopulation = await TargetPopulation.build(campaign);
        const upTodate = await this.getAreDataValuesUpTodate(targetPopulation, campaign);
        return targetPopulation.updateIsPersisted(upTodate);
    }

    async save(targetPopulation: TargetPopulation, campaign: Campaign): Promise<void> {
        const dataValues = await this.getDataValues(targetPopulation, campaign);
        const populationResult = await this.postDataValues(dataValues);

        if (!populationResult.status) {
            const msg = populationResult.error || "Unknown error";
            throw new Error("Error saving target population: " + msg);
        }
    }

    private async getDataValues(
        targetPopulation: TargetPopulation,
        campaign: Campaign
    ): Promise<DataValue[]> {
        const { config } = campaign;
        const { antigensDisaggregation } = targetPopulation.data;
        const cocMetadata = await campaign.antigensDisaggregation.getCocMetadata(this.db);
        const startPeriod = moment.utc(campaign.startDate || new Date()).format(dailyPeriodFormat);
        const periods = getDaysRange(
            moment.utc(campaign.startDate || undefined),
            moment.utc(campaign.endDate || undefined)
        ).map(day => day.format(dailyPeriodFormat));

        const dataValues = _.flatMap(
            targetPopulation.data.populationItems,
            targetPopulationItem => {
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

                const finalDistribution =
                    targetPopulation.getFinalDistribution(targetPopulationItem);

                const populationByAgeDataValues = _.flatMap(antigensDisaggregation, ad => {
                    const antigen = assert(config.antigens.find(a => a.id === ad.antigen.id));
                    const ageGroupsForAntigen = _(antigen.ageGroups)
                        .flatten()
                        .flatten()
                        .uniqBy(ageGroup => ageGroup.id)
                        .value();
                    const antigenDisaggregation = antigensDisaggregation.find(
                        disaggregation => disaggregation.antigen.id === antigen.id
                    );
                    return _.flatMap(ageGroupsForAntigen, ageGroup => {
                        // We must include the doses disaggregated as some antigens
                        // (ie. Malaria) have different age groups per dose.
                        return _.flatMap(antigen.doses, dose => {
                            const disaggregation = [ageGroup];

                            const ageGroupInPopulation =
                                antigenDisaggregation &&
                                isAgeGroupIncluded(ageGroup, antigenDisaggregation, dose);

                            let populationForAgeRange: number;
                            if (ageGroupInPopulation) {
                                const percentageForAgeRange = get(
                                    _(finalDistribution).getOrFail(ageGroup.displayName),
                                    `Value for age range not found: ${ageGroup}`
                                );
                                populationForAgeRange =
                                    (totalPopulation * percentageForAgeRange) / 100;
                            } else {
                                populationForAgeRange = 0;
                            }

                            return periods.map(period => {
                                return this.mapDataValue(campaign, antigen, dose, {
                                    period: period,
                                    orgUnit: orgUnitId,
                                    categoryOptionCombo: cocMetadata.getByOptions(disaggregation),
                                    value: populationForAgeRange.toFixed(2),
                                });
                            });
                        });
                    });
                });

                const { ageGroups, ageDistributionByOrgUnit } = targetPopulation.data;
                const ageDistributionDataValues = _.flatMap(
                    targetPopulationItem.populationDistributions,
                    populationDistribution => {
                        return _(ageGroups)
                            .map(ageGroup => {
                                const ouId = populationDistribution.organisationUnit.id;
                                const value =
                                    _(ageDistributionByOrgUnit).getOrFail(ouId)[
                                        ageGroup.displayName
                                    ];

                                return value
                                    ? {
                                          period: startPeriod,
                                          orgUnit: ouId,
                                          dataElement:
                                              config.population.ageDistributionDataElement.id,
                                          categoryOptionCombo: cocMetadata.getByOptions([ageGroup]),
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
            }
        );

        return dataValues;
    }

    private async getAreDataValuesUpTodate(
        targetPopulation: TargetPopulation,
        campaign: Campaign
    ): Promise<boolean> {
        if (!campaign.id) return false;
        const { config } = campaign;

        let expectedDataValues: DataValue[];
        try {
            expectedDataValues = await this.getDataValues(targetPopulation, campaign);
        } catch (err) {
            // If we fail to get the expected data values, consider values are not up to date
            return false;
        }

        const dataElementIds = _(expectedDataValues)
            .map(dv => dv.dataElement)
            .uniq()
            .value();

        const campaignOrgUnitIds = new Set(campaign.organisationUnits.map(ou => ou.id));

        const actualDataValues = await this.db.getDataValues({
            dataElement: dataElementIds,
            orgUnit: Array.from(campaignOrgUnitIds),
            startDate: campaign.startDate || undefined,
            endDate: campaign.endDate || undefined,
        });

        const getKey = (dataValue: DataValue) =>
            [
                dataValue.dataElement,
                dataValue.period,
                dataValue.orgUnit,
                dataValue.categoryOptionCombo || config.defaults.categoryOptionCombo.id,
                dataValue.value,
            ].join(".");

        const actualKeys = new Set(actualDataValues.map(getKey));

        // Check that all expected data values for the campaign orgunits are present in actual data values
        return _(expectedDataValues)
            .filter(dv => campaignOrgUnitIds.has(dv.orgUnit))
            .every(expectedDv => actualKeys.has(getKey(expectedDv)));
    }

    private mapDataValue(
        campaign: Campaign,
        antigen: AntigenConfig,
        dose: Dose,
        dv: Omit<DataValue, "dataElement">
    ): DataValue {
        const dataElementCode = baseConfig.dataElementCodeForPopulationByAge;
        const match = assert(
            campaign
                .getEnabledAntigensDisaggregation()
                .find(enabled => enabled.antigen.id === antigen.id)
        );

        const dataElements = getDataElements(campaign, match, dataElementCode, dose);

        const d2DataElement = assert(
            dataElements[0],
            `No data element found for antigen: ${antigen.name}`
        );

        return { ...dv, dataElement: d2DataElement.id };
    }

    private async postDataValues(dataValues: DataValue[]): Promise<Response<object>> {
        const dataValuesToPost: DataValueToPost[] = _(dataValues)
            .map(dv => {
                return {
                    dataSet: dv.dataSet,
                    period: dv.period,
                    orgUnit: dv.orgUnit,
                    attributeOptionCombo: dv.attributeOptionCombo,
                    dataElement: dv.dataElement,
                    categoryOptionCombo: dv.categoryOptionCombo,
                    value: dv.value,
                    comment: dv.comment,
                };
            })
            .compact()
            .value();

        const dataValuesChunks = _.chunk(dataValuesToPost, 200);

        const responses = await promiseMap(dataValuesChunks, dataValuesChunk => {
            return this.d2Api.dataValues.postSet({}, { dataValues: dataValuesChunk }).getData();
        });

        const errorResponses = responses.filter(response => {
            return response.status !== "SUCCESS";
        });

        if (_(errorResponses).isEmpty()) {
            return { status: true };
        } else {
            return { status: false, error: errorResponses };
        }
    }
}

type DataValueToPost = DataValueSetsPostRequest["dataValues"][number];

const dailyPeriodFormat = "YYYYMMDD";

function get<T>(value: T | undefined, errorMsg: string): T {
    if (_.isUndefined(value)) {
        throw new Error(errorMsg);
    } else {
        return value;
    }
}
