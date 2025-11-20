import { getMetadataConfig } from "../../models/config";
import { getDbD2SnapMock } from "../../testing/d2-snap-mock";

export async function getConfig() {
    const mockD2 = getDbD2SnapMock("config");
    const config = await getMetadataConfig(mockD2);
    return { config, mockD2 };
}
