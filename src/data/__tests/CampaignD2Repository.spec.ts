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
        it("should retrieve campaign metadata", async () => {
            const { config } = await getConfig();
            const mockD2 = getDbD2SnapMock("campaign-get");
            const campaign = await new CampaignD2Repository(config, mockD2).get("GEiIBCM2cMI");

            expect(mockD2).toBeFulfilled();
            expect(campaign.name).toEqual("ZCampaignD2Repository Test");
            expect(campaign.antigenCodes).toEqual(["RVC_ANTIGEN_MALARIA", "RVC_ANTIGEN_JPENC"]);
        });
    });
});
