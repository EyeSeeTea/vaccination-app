import _ from "lodash";
import Campaign from "../../models/campaign";
import CampaignDb from "../../models/CampaignDb";
import DbD2 from "../../models/db-d2";
import { Sharing } from "../../models/db.types";
import { Teams } from "../../models/Teams";
import { AntigensDisaggregation } from "../../models/AntigensDisaggregation";
import { getConfig } from "./campaign-test-helpers";
import { getCampaign } from "./getCampaign";

/*
    DHIS2 >= 41 ignores root-level sharing properties (public, userAccesses, ...) on metadata
    objects. Check that every object posted on a campaign save carries its sharing under `sharing`.
*/

const dataSetSharing: Sharing = {
    public: "rwrw----",
    external: false,
    users: {},
    userGroups: {},
};

const dashboardSharing: Sharing = {
    public: "--------",
    external: false,
    users: { user1: { id: "user1", access: "rw------" } },
    userGroups: { group1: { id: "group1", access: "rw------" } },
};

const rootSharingKeys = [
    "public",
    "external",
    "users",
    "userGroups",
    "publicAccess",
    "externalAccess",
    "userAccesses",
    "userGroupAccesses",
];

describe("CampaignDb", () => {
    describe("save", () => {
        it("posts sharing nested in the sharing property", async () => {
            const metadata = await saveCampaignAndGetPostedMetadata();
            const { dataSets, dashboards, visualizations, categoryOptions } = metadata;

            const campaignDataSet = dataSets.find(dataSet => dataSet.name === "0Campaign Test");
            expect(campaignDataSet?.sharing).toEqual(dataSetSharing);

            expect(dashboards).toHaveLength(1);
            expect(dashboards[0]?.sharing).toEqual(dashboardSharing);

            expect(visualizations.length).toBeGreaterThan(0);
            visualizations.forEach(visualization => {
                expect(visualization.sharing).toEqual(dashboardSharing);
            });

            expect(categoryOptions.length).toBeGreaterThan(0);
            categoryOptions.forEach(categoryOption => {
                expect(categoryOption.sharing).toEqual(
                    expect.objectContaining({ public: "rwrw----" })
                );
            });

            const allObjects = [...dataSets, ...dashboards, ...visualizations, ...categoryOptions];
            allObjects.forEach(object => {
                expect(_.pick(object, rootSharingKeys)).toEqual({});
            });
        });
    });
});

type PostedObject = { name?: string; sharing?: unknown };

type PostedMetadata = Record<
    "dataSets" | "dashboards" | "visualizations" | "categoryOptions",
    PostedObject[]
>;

async function saveCampaignAndGetPostedMetadata(): Promise<PostedMetadata> {
    const { config } = await getConfig();
    const postMetadata = jest.fn(async (_metadata: object) => ({
        status: true,
        value: { status: "OK" },
    }));
    const db = { api: {}, postMetadata } as unknown as DbD2;
    const campaign = getCampaign(config, db);
    const organisationUnits = campaign.organisationUnits.map(ou => ({ ...ou, displayName: ou.id }));
    db.api.get = async () => ({ organisationUnits });

    jest.spyOn(Campaign.prototype, "isEdit").mockResolvedValue(false);
    jest.spyOn(Campaign.prototype, "teamsMetadata").mockResolvedValue({ elements: [] });
    jest.spyOn(Campaign.prototype, "getDataSetSharing").mockResolvedValue(dataSetSharing);
    jest.spyOn(Campaign.prototype, "getDashboardSharing").mockResolvedValue(dashboardSharing);
    jest.spyOn(AntigensDisaggregation.prototype, "getCocMetadata").mockResolvedValue(
        {} as Awaited<ReturnType<AntigensDisaggregation["getCocMetadata"]>>
    );
    jest.spyOn(Teams, "updateTeamCategory").mockResolvedValue({ status: true });

    const campaignDbProto = CampaignDb.prototype as any;
    jest.spyOn(campaignDbProto, "getExistingDataSet").mockResolvedValue(undefined);
    jest.spyOn(campaignDbProto, "getSections").mockResolvedValue([]);
    jest.spyOn(campaignDbProto, "getExtraDataSets").mockResolvedValue([]);

    const res = await new CampaignDb(campaign).save();
    expect(res).toEqual({ status: true });
    expect(postMetadata).toHaveBeenCalledTimes(1);

    return postMetadata.mock.calls[0]?.[0] as PostedMetadata;
}
