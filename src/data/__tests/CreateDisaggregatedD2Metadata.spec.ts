import { getD2ApiSnapMock } from "../../testing/d2-snap-mock";
import { CreateDisaggregatedD2Metadata } from "../CreateDisaggregatedD2Metadata";

describe("CreateDisaggregationD2Metadata", () => {
    it("posts metadata", async () => {
        const api = getD2ApiSnapMock("create-disaggregated-metadata");
        const res = await new CreateDisaggregatedD2Metadata(api).execute();
        expect(res.status).toEqual("OK");
        expect(api).toBeFulfilled();
    });
});
