import { list } from "../datasets";
import { getD2Stub } from "../../utils/testing";
import metadataConfig from "./config-mock";

const expectedFields = [
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
    "attributeValues[value, attribute[code]]",
    "organisationUnits[id,path]",
];

const createdByAppFilters = [
    "attributeValues.attribute.id:eq:1",
    "categoryCombo.code:in:[RVC_TEAM,RVC_TEAM_REACTIVE,RVC_TEAM_PREVENTIVE]",
];
const emptyCollection = { pager: { page: 1, total: 0 }, toArray: () => [] };
const listMock = jest.fn(() => Promise.resolve(emptyCollection));

describe("DataSets", () => {
    describe("get", () => {
        describe("without filters nor pagination", () => {
            it("returns datasets", async () => {
                const d2 = getD2Stub({ models: { dataSets: { list: listMock } } });
                await list(metadataConfig, d2, {}, {});

                expect(d2.models.dataSets.list).toHaveBeenCalledWith({
                    fields: expectedFields.join(","),
                    pageSize: 1000,
                    filter: createdByAppFilters,
                });
            });
        });

        describe("with filters and paginations", () => {
            it("returns datasets", async () => {
                const d2 = getD2Stub({
                    currentUser: { id: "b123123123" },
                    models: { dataSets: { list: listMock } },
                });
                const filters = {
                    search: "abc",
                };
                const pagination = {
                    page: 2,
                    pageSize: 10,
                    sorting: ["displayName", "desc"],
                };
                await list(metadataConfig, d2, filters, pagination);

                expect(d2.models.dataSets.list).toHaveBeenCalledWith({
                    fields: expectedFields.join(","),
                    pageSize: 1000,
                    filter: ["displayName:ilike:abc", ...createdByAppFilters],
                    order: "displayName:idesc",
                });
            });
        });

        describe("filters datasets by attribute", () => {
            it("returns only datasets with the CREATED_BY_VACCINATION attribute set", async () => {
                const testIds = ["id1", "id2", "id3", "id4"];
                const attribute = metadataConfig.attributes.app;
                const organisationUnits = {
                    toArray: () => [{ path: "/1/10/100" }, { path: "/1/11" }],
                };
                const testDataSets = [
                    {
                        id: testIds[0],
                        attributeValues: [{ value: "true", attribute }],
                        organisationUnits,
                    },
                    {
                        id: testIds[1],
                        attributeValues: [{ value: "false", attribute }],
                        organisationUnits,
                    },
                    {
                        id: testIds[2],
                        attributeValues: [{ value: "true", attribute }],
                        organisationUnits,
                    },
                    {
                        id: testIds[3],
                        attributeValues: [{ value: "false", attribute }],
                        organisationUnits,
                    },
                ];
                const listMock = jest.fn(() =>
                    Promise.resolve({ toArray: () => testDataSets, pager: {} })
                );
                const d2 = getD2Stub({
                    models: { dataSets: { list: listMock } },
                });

                d2.currentUser[Symbol.for("dataViewOrganisationUnits")] = ["1"];

                const { pager, objects: dataSets } = await list(metadataConfig, d2, {}, {});

                expect(dataSets.map(ds => ds.id).sort()).toEqual([testIds[0], testIds[2]].sort());
                expect(pager).toEqual({ page: 1, total: 2 });
            });
        });

        describe("filters datasets by user dataView organisation units", () => {
            it("returns only datasets if current user dataView orgUnits all match", async () => {
                const testIds = ["id1", "id2", "id3", "id4"];
                const attribute = metadataConfig.attributes.app;
                const attributeValues = [{ value: "true", attribute }];
                const testDataSets = [
                    {
                        id: testIds[0],
                        attributeValues,
                        organisationUnits: {
                            toArray: () => [{ path: "/1/10/100" }, { path: "/1/11" }],
                        },
                    },
                    {
                        id: testIds[1],
                        attributeValues,
                        organisationUnits: {
                            toArray: () => [{ path: "/1/10/100" }],
                        },
                    },
                    {
                        id: testIds[2],
                        attributeValues,
                        organisationUnits: {
                            toArray: () => [{ path: "/1/11" }],
                        },
                    },
                ];
                const listMock = jest.fn(() =>
                    Promise.resolve({ toArray: () => testDataSets, pager: {} })
                );
                const d2 = getD2Stub({
                    models: { dataSets: { list: listMock } },
                });
                d2.currentUser[Symbol.for("dataViewOrganisationUnits")] = ["1"];

                const { objects: dataSets1 } = await list(metadataConfig, d2, {}, {});
                expect(dataSets1.map(ds => ds.id).sort()).toEqual(
                    [testIds[0], testIds[1], testIds[2]].sort()
                );

                d2.currentUser[Symbol.for("dataViewOrganisationUnits")] = ["10"];

                const { objects: dataSets2 } = await list(metadataConfig, d2, {}, {});
                expect(dataSets2.map(ds => ds.id).sort()).toEqual([testIds[1]].sort());
            });
        });
    });
});
