import { assert } from "../../utils/assert";
import { getConfig } from "./campaign-test-helpers";
import { getCampaign } from "./getCampaign";
import path from "path";

describe("TargetPopulation", () => {
    describe("getDataValues", () => {
        it("should post metadata", async () => {
            const { config, mockD2 } = await getConfig();
            const campaign = getCampaign(config, mockD2);

            const campaignWithPopulation = await campaign.withTargetPopulation();
            const targetPopulation = assert(campaignWithPopulation.targetPopulation);

            // MSF -> OCBA -> DRC_SK -> ZZZ_RUSK_211201_Bikenge, Rougeole_CLOSED -> CDS MBUTU
            const targetPopulationUpdated = targetPopulation
                .setTotalPopulation("lrjmTKZJUEx", 1000) //
                // Malaria
                .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "5 - 11 m" }, 1)
                .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "12 - 23 m" }, 2)
                .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "24 - 35 m" }, 3)
                // Japanese Encephalitis
                .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "8 - 11 m" }, 4)
                .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "15 - 29 y" }, 5);

            const dataValues = await targetPopulationUpdated.getDataValues();
            expectToMatchSnapshot(dataValues, "target-population-data-values");
            expect(mockD2).toBeFulfilled();
        });
    });
});

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function expectToMatchSnapshot(json: JsonValue, snapshotName: string) {
    const folder = path.dirname(expect.getState().testPath);
    const snapshotPath = path.join(folder, "__snapshots__", snapshotName + ".json");
    const jsonString = JSON.stringify(json, null, 4) + "\n";
    expect(jsonString).toMatchFile(snapshotPath);
}
