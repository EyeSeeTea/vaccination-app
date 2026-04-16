import { TargetPopulationRepository } from "../domain/repositories/TargetPopulationRepository";
import _ from "lodash";
import Campaign from "../models/campaign";
import DbD2 from "../models/db-d2";
import { TargetPopulation } from "../models/TargetPopulation";
import { DataValue, Response } from "../models/db.types";
import { promiseMap } from "../utils/promises";
import { D2Api, DataValueSetsPostRequest } from "../types/d2-api";

export class TargetPopulationD2Repository implements TargetPopulationRepository {
    private d2Api: D2Api;

    constructor(private db: DbD2) {
        this.d2Api = db.d2Api;
    }

    async getForCampaign(campaign: Campaign): Promise<TargetPopulation> {
        return TargetPopulation.build(campaign);
    }

    async save(targetPopulation: TargetPopulation): Promise<void> {
        const dataValues = await targetPopulation.getDataValues();
        const populationResult = await this.postDataValues(dataValues);

        if (!populationResult.status) {
            const msg = populationResult.error || "Unknown error";
            throw new Error("Error saving target population: " + msg);
        }
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
