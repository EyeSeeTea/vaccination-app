import _ from "lodash";
import moment from "moment";
import { baseConfig } from "./config";
import { Maybe } from "./db.types";

export function getCampaignPeriods<
    DataSet extends ModelWithAttributes & DataSetWithDataInputPeriods
>(dataSet: DataSet): Maybe<CampaignPeriods> {
    return getPeriodDatesFromAttributes(dataSet) || getPeriodDatesFromDataInputPeriods(dataSet);
}

function getPeriodDatesFromAttributes<DataSetWithAttributes extends ModelWithAttributes>(
    dataSet: DataSetWithAttributes
): Maybe<CampaignPeriods> {
    const dataInputAttribute = dataSet.attributeValues.find(
        av => av.attribute.code === baseConfig.attributeCodeForDataInputPeriods
    );
    if (!dataInputAttribute || !dataInputAttribute.value) return;

    const dataInput = JSON.parse(dataInputAttribute.value) as DataInput;

    return {
        startDate: new Date(dataInput.periodStart),
        endDate: new Date(dataInput.periodEnd),
    };
}

function getPeriodDatesFromDataInputPeriods(
    dataSet: DataSetWithDataInputPeriods
): Maybe<CampaignPeriods> {
    const { dataInputPeriods } = dataSet;
    if (!dataInputPeriods) return;

    const getDateFromPeriodId = (periodId: string) => moment(periodId, "YYYYMMDD").toDate();
    const periods = dataInputPeriods.map(dip => dip.period.id);
    const [min, max] = [_.min(periods), _.max(periods)];
    if (!min || !max) return;

    return {
        startDate: getDateFromPeriodId(min),
        endDate: getDateFromPeriodId(max),
    };
}

export type DataInput = {
    periodStart: string;
    periodEnd: string;
    openingDate: string;
    closingDate: string;
};

type ModelWithAttributes = {
    attributeValues: Array<{
        attribute: { code: string };
        value: string;
    }>;
};

type DataSetWithDataInputPeriods = {
    dataInputPeriods: Array<{ period: { id: string } }>;
};

type CampaignPeriods = { startDate: Date; endDate: Date };
