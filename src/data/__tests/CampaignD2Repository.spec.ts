import { getDbD2SnapMock } from "../../testing/d2-snap-mock";
import { CampaignD2Repository } from "../CampaignD2Repository";
import { getConfig } from "./campaign-test-helpers";
import { getCampaign } from "./getCampaign";

describe("CampaignD2Repository", () => {
    describe("save", () => {
        it("should post metadata", async () => {
            const { config } = await getConfig();
            const mockD2 = getDbD2SnapMock("campaign-save");
            const campaign = getCampaign(config, mockD2);

            const res = await new CampaignD2Repository(config, mockD2).save(campaign);

            expect(mockD2).toBeFulfilled();
            expect(res).toEqual({ status: true });
        });
    });

    describe("get", () => {
        it("should get campaign with correct disaggregations", async () => {
            const { config } = await getConfig();
            const mockD2 = getDbD2SnapMock("campaign-get");
            const campaign = await new CampaignD2Repository(config, mockD2).get("mOGi376dpt2");

            expect(mockD2).toBeFulfilled();
            expect(campaign.name).toEqual("Campaign Test");
            expect(campaign.antigenCodes).toEqual(["RVC_ANTIGEN_MALARIA", "RVC_ANTIGEN_JPENC"]);

            const [malaria, japaneseEnc] = campaign.antigensDisaggregation.getEnabled();
            expect(malaria).toBeDefined();
            expect(japaneseEnc).toBeDefined();
            if (!malaria || !japaneseEnc) throw new Error("Antigens not found");

            expect(malaria.type).toEqual("preventive");
            expect(malaria.antigen.code).toEqual("RVC_ANTIGEN_MALARIA");
            expect(malaria.ageGroups.map(ag => ag.name)).toEqual([
                "5 - 11 m",
                "12 - 23 m",
                "24 - 35 m",
            ]);

            expect(japaneseEnc.type).toEqual("reactive");
            expect(japaneseEnc.antigen.code).toEqual("RVC_ANTIGEN_JPENC");
            expect(japaneseEnc.ageGroups.map(ag => ag.name)).toEqual(["8 - 11 m", "15 - 29 y"]);
        });
    });
});
