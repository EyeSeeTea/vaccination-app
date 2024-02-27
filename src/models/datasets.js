import _ from "lodash";
import { getCurrentUserDataViewOrganisationUnits } from "../utils/dhis2";
import { getCampaignPeriods } from "./CampaignDb";

const requiredFields = ["attributeValues[value, attribute[code]]", "organisationUnits[id,path]"];

const defaultListFields = [
    "id",
    "name",
    "displayName",
    "displayDescription",
    "created",
    "lastUpdated",
    "publicAccess",
    "user",
    "href",
    "dataInputPeriods[period[id]]",
];

/* Return object with pager and array of datasets.

Fields: fields.fields or listFields

Filters:

    - filter.search: string
    - attributeValues -> RVC_CREATED_BY_VACCINATION_APP === "true"
    - Orgunits must be in user.dataViewOrganisationUnits.

NOTE: It's not possible to filter all in a single call, so we first make an unpaginated call,
filter the results, and finally build the pager ({page: number, total: number}) programatically.
*/
export async function list(config, d2, filters, pagination) {
    const { search, fields: forcedFields } = filters || {};
    const { page = 1, pageSize = 20, sorting } = pagination || {};

    // order=FIELD:DIRECTION where direction = "iasc" | "idesc" (insensitive ASC, DESC)
    const [field, direction] = sorting || [];
    const order = field && direction ? `${field}:i${direction}` : undefined;

    const filter = _.compact([
        search ? `displayName:ilike:${search}` : null,
        // Preliminar filters (presence of attribute createdByApp and categoryCombo=TEAMS)
        `attributeValues.attribute.id:eq:${config.attributes.app.id}`,
        `categoryCombo.code:eq:${config.categoryCodeForTeams}`,
    ]);
    const fields = (forcedFields || defaultListFields).concat(requiredFields).join(",");
    const listOptions = { fields, filter, pageSize: 1000, order, apiEndpoint: "/dataSets" };

    const dataSetsBase = await d2.models.dataSets
        .list(_.pickBy(listOptions, x => _.isNumber(x) || !_.isEmpty(x)))
        .then(collection =>
            collection.toArray().map(dataSet => ({
                ...dataSet,
                organisationUnits: dataSet.organisationUnits.toArray(),
            }))
        );

    const dataSetsFiltered = dataSetsBase.filter(
        dataSet => isDataSetCreatedByApp(dataSet, config) && isDataSetInUserOrgUnits(d2, dataSet)
    );

    const dataSetsPaginated = _(dataSetsFiltered)
        .drop(pageSize * (page - 1))
        .take(pageSize)
        .value();

    return {
        pager: { page, total: dataSetsFiltered.length },
        objects: dataSetsPaginated,
    };
}

function isDataSetCreatedByApp(dataSet, config) {
    const attributeValueForApp = _(dataSet.attributeValues || [])
        .keyBy(attributeValue => (attributeValue.attribute ? attributeValue.attribute.code : null))
        .get(config.attributeCodeForApp);

    return attributeValueForApp && attributeValueForApp.value === "true";
}

function isDataSetInUserOrgUnits(d2, dataSet) {
    const userOrgUnits = getCurrentUserDataViewOrganisationUnits(d2);

    return dataSet.organisationUnits.every(dataSetOrgUnit =>
        _(dataSetOrgUnit.path.split("/"))
            .intersection(userOrgUnits)
            .isNotEmpty()
    );
}

export async function getOrganisationUnitsById(id, d2) {
    const fields = "organisationUnits[id,name]";
    const dataSet = await d2.models.dataSets.get(id, { fields }).catch(() => undefined);
    const organisationUnits = dataSet ? dataSet.organisationUnits.toArray() : null;
    //TODO: Make it so the user can choose the OU
    return _(organisationUnits).isEmpty() ? undefined : organisationUnits[0].id;
}

export async function getPeriodDatesFromDataSetId(id, d2) {
    const fields = "attributeValues[value, attribute[code]]";
    const dataSet = await d2.models.dataSets.get(id, { fields }).catch(() => undefined);
    return dataSet ? getPeriodDatesFromDataSet(dataSet) : null;
}

export function getPeriodDatesFromDataSet(dataSet) {
    return getCampaignPeriods(dataSet);
}

export async function getDatasetById(id, d2) {
    const fields = ["id", "attributeValues[value, attribute[code]]"].join(",");
    const dataSet = await d2.models.dataSets.get(id, { fields }).catch(() => undefined);
    return dataSet;
}
