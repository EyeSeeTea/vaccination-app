import _ from "lodash";
import { CampaignId } from "../../models/campaign";
import { CampaignNotification } from "../../models/CampaignNotification";
import DbD2 from "../../models/db-d2";
import { CampaignRepository, DeleteResponse } from "../repositories/CampaignRepository";
import { NotificationRepository } from "../repositories/NotificationRepository";

export class DeleteCampaignUseCase {
    constructor(
        private db: DbD2,
        private repositories: {
            campaignRepository: CampaignRepository;
            notificationRepository: NotificationRepository;
        }
    ) {}

    async execute(campaignIds: CampaignId[]): Promise<DeleteResponse> {
        const res = await this.repositories.campaignRepository.delete(campaignIds);

        if (res.status) {
            return res;
        } else if (_.isEqual(res.error.keys, []) || _.isEqual(res.error.keys, ["teams"])) {
            this.sendNotification({ dataSetsWithDataValues: res.dataSetsWithDataValues });
            return res;
        } else {
            return res;
        }
    }

    private sendNotification(options: {
        dataSetsWithDataValues: Array<{ name: string }>;
    }): Promise<boolean> {
        const { notificationRepository } = this.repositories;
        const notification = new CampaignNotification(this.db, notificationRepository);
        return notification.sendOnUpdateOrDelete(options.dataSetsWithDataValues, "delete");
    }
}
