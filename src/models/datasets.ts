import _ from "lodash";
import { getCampaignPeriods } from "./CampaignDb";
import { D2 } from "./d2.types";

export async function getOrganisationUnitsByDataSetId(id: string, d2: D2) {
    const fields = "organisationUnits[id,name]";
    const dataSet = await d2.models.dataSets.get(id, { fields }).catch(() => undefined);
    const organisationUnits = dataSet ? dataSet.organisationUnits.toArray() : null;
    //TODO: Make it so the user can choose the OU
    return _(organisationUnits).isEmpty() ? undefined : organisationUnits[0].id;
}

export async function getPeriodDatesFromDataSetId(id: string, d2: D2) {
    const fields = "attributeValues[value, attribute[code]]";
    const dataSet = await d2.models.dataSets.get(id, { fields }).catch(() => undefined);
    return dataSet ? getCampaignPeriods(dataSet) : null;
}
