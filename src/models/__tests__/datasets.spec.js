import { list } from "../datasets";
import { getD2Stub } from "../../utils/testing";

const metadataConfig = { attibuteCodeForApp: "RVC_CREATED_BY_VACCINATION_APP" };

const expectedFields = [
    "id",
    "name",
    "code",
    "displayName",
    "displayDescription",
    "shortName",
    "created",
    "lastUpdated",
    "externalAccess",
    "publicAccess",
    "userAccesses",
    "userGroupAccesses",
    "user",
    "access",
    "attributeValues[value, attribute[code]]",
    "href",
];

const emptyCollection = { pager: {}, toArray: () => [] };
const listMock = jest.fn(() => Promise.resolve(emptyCollection));

describe("DataSets", () => {
    describe("get", () => {
        describe("without filters nor pagination", () => {
            it("returns datasets", async () => {
                const d2 = getD2Stub({ models: { dataSets: { list: listMock } } });
                await list(d2, {}, {});

                expect(d2.models.dataSets.list).toHaveBeenNthCalledWith(1, {
                    fields: ["id", "attributeValues[value, attribute[code]]"],
                    paging: false,
                    filter: `attributeValues.attribute.code:eq:${
                        metadataConfig.attibuteCodeForApp
                    }`,
                });

                expect(d2.models.dataSets.list).toHaveBeenLastCalledWith({
                    fields: expectedFields,
                    order: undefined,
                    page: undefined,
                    pageSize: 20,
                    filter: ["id:in:[]"],
                });
                expect(d2.models.dataSets.list).toHaveBeenCalledTimes(2);
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
                    showOnlyUserCampaigns: true,
                };
                const pagination = {
                    page: 2,
                    pageSize: 10,
                    sorting: ["displayName", "desc"],
                };
                await list(d2, filters, pagination);

                expect(d2.models.dataSets.list).toHaveBeenCalledWith({
                    fields: expectedFields,
                    order: "displayName:idesc",
                    page: 2,
                    pageSize: 10,
                    filter: ["displayName:ilike:abc", "user.id:eq:b123123123", "id:in:[]"],
                });
            });
        });

        describe("filters datasets by attribute", () => {
            it("returns only datasets with the CREATED_BY_VACCINATION attribute set", async () => {
                const testIds = ["id1", "id2", "id3", "id4"];
                const code = metadataConfig.attibuteCodeForApp;
                const testDataSets = [
                    { id: testIds[0], attributeValues: [{ value: "true", attribute: { code } }] },
                    { id: testIds[1], attributeValues: [{ value: "false", attribute: { code } }] },
                    { id: testIds[2], attributeValues: [{ value: "true", attribute: { code } }] },
                    { id: testIds[3], attributeValues: [{ value: "false", attribute: { code } }] },
                ];
                const listMock = jest.fn(() =>
                    Promise.resolve({ toArray: () => testDataSets, pager: {} })
                );
                const d2 = getD2Stub({ models: { dataSets: { list: listMock } } });
                await list(d2, {}, {});

                expect(d2.models.dataSets.list).toHaveBeenLastCalledWith({
                    fields: expectedFields,
                    order: undefined,
                    page: undefined,
                    pageSize: 20,
                    filter: [`id:in:[${testIds[0]},${testIds[2]}]`],
                });
            });
        });
    });
});
