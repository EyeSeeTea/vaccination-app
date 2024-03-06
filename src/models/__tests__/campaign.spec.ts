import Campaign from "../campaign";
import DbD2 from "../db-d2";
import { getD2Stub } from "../../utils/testing";
import _ from "lodash";
import metadataConfig from "./config-mock";

const metadataStub = jest.fn(() => Promise.resolve({ categoryOptions: [], organisationUnits: [] }));

const d2 = getD2Stub({ Api: { getApi: () => ({ get: metadataStub }) } });
const db = new DbD2(d2);
const campaign = Campaign.create(metadataConfig, db);
describe("Campaign", () => {
    describe("Validations", () => {
        it("requires a name", async () => {
            const messages = await campaign.validate();
            expect(messages).toEqual(
                expect.objectContaining({
                    name: [
                        {
                            key: "cannot_be_blank",
                            namespace: { field: "Name" },
                        },
                    ],
                })
            );
        });

        it("requires at least one orgunit", async () => {
            const messages = await campaign.validate();
            expect(messages).toEqual(
                expect.objectContaining({
                    organisationUnits: [{ key: "no_organisation_units_selected" }],
                })
            );
        });

        it("requires at least one orgunit of level 5", async () => {
            const ids = [
                "zOyMxdCLXBM",
                "G7g4TvbjFlX",
                "lmelleX7G5X",
                "ll8gkZ6djJG",
                "RlnRXcjKY69",
                "pmROYBZA9SI",
                "AxkRidrb0E5",
                "w82ydGtPAE0",
                "vB9T3dc2fqY",
                "qgmBzwyBhcq",
            ];

            for (const level of _.range(1, 10)) {
                const path =
                    "/" +
                    _(ids)
                        .take(level)
                        .join("/");
                const campaignWithOrgUnit = campaign.setOrganisationUnits([
                    {
                        id:
                            _(path)
                                .split("/")
                                .last() || "",
                        path: path,
                    },
                ]);
                const messages = await campaignWithOrgUnit.validate();

                if (level == 6) {
                    expect(messages).toEqual(expect.objectContaining({}));
                } else {
                    expect(messages).toEqual(
                        expect.objectContaining({
                            organisationUnits: [
                                {
                                    key: "organisation_units_only_of_levels",
                                    namespace: { levels: "6" },
                                },
                            ],
                        })
                    );
                }
            }
        });
    });
});

export {};
