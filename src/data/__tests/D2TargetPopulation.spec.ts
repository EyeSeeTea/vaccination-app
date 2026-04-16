import { getConfig } from "./campaign-test-helpers";
import { getCampaign } from "./getCampaign";
import { getCompositionRoot } from "../../CompositionRoot";
import { getD2ApiSnapMock, getDbD2SnapMock } from "../../testing/d2-snap-mock";

describe("TargetPopulation", () => {
    describe("getDataValues", () => {
        it("should post metadata", async () => {
            const { config } = await getConfig();

            const mockD2 = getDbD2SnapMock("target-population-d2-get");
            const mockD2Api = getD2ApiSnapMock("target-population-d2-api-get");
            const campaign = getCampaign(config, mockD2);
            const compositionRoot = getCompositionRoot({
                config: config,
                db: mockD2,
                api: mockD2Api,
            });

            const targetPopulation = await compositionRoot.targetPopulation.getForCampaign.execute(
                campaign
            );

            // MSF -> OCBA -> DRC_SK -> ZZZ_RUSK_211201_Bikenge Rougeole_CLOSED [wY8HiLmETeU]
            // -> CDS MBUTU [BaEwEdzSA6G] -> External Consultations [lrjmTKZJUEx]
            const targetPopulationUpdated = targetPopulation
                .setTotalPopulation("lrjmTKZJUEx", 1000) //
                // Malaria
                .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "5 - 11 m" }, 1)
                .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "12 - 23 m" }, 2)
                .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "24 - 35 m" }, 3)
                // Japanese Encephalitis
                .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "8 - 11 m" }, 4)
                .setAgeGroupPopulation({ orgUnitIds: ["lrjmTKZJUEx"], ageGroup: "15 - 29 y" }, 5);

            const ageDistributionByOrgUnit = targetPopulationUpdated.data.ageDistributionByOrgUnit;

            expect(ageDistributionByOrgUnit).toEqual({
                // Project level
                wY8HiLmETeU: {
                    "5 - 11 m": 1,
                    "8 - 11 m": 4,
                    "12 - 23 m": 2,
                    "24 - 35 m": 3,
                    "15 - 29 y": 5,
                },
                // Health service level
                lrjmTKZJUEx: {
                    "5 - 11 m": 1,
                    "8 - 11 m": 4,
                    "12 - 23 m": 2,
                    "24 - 35 m": 3,
                    "15 - 29 y": 5,
                },
            });
            expect(mockD2).toBeFulfilled();
        });
    });
});
