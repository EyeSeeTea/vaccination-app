import Campaign, { CampaignId } from "../../models/campaign";
import { Response } from "../../models/db.types";

export interface CampaignRepository {
    get(id: string): Promise<Campaign>;
    save(campaign: Campaign): Promise<Response<string>>;
    delete(campaignIds: CampaignId[]): Promise<DeleteResponse>;
    hasDataValues(campaignId: CampaignId): Promise<boolean>;
}

type DataSet = { id: string; name: string };

export type DeleteResponse =
    | {
          status: true;
          dataSetsWithDataValues: DataSet[];
      }
    | {
          status: false;
          dataSetsWithDataValues: DataSet[];
          error: {
              keys: Array<"teams" | "dashboards" | "other">;
              level: string;
              message: string;
          };
      };
