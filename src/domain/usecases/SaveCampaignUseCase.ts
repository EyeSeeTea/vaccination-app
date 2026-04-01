import Campaign from "../../models/campaign";
import { CampaignNotification } from "../../models/CampaignNotification";
import DbD2 from "../../models/db-d2";
import { Response } from "../../models/db.types";
import { CampaignRepository } from "../repositories/CampaignRepository";
import { NotificationRepository } from "../repositories/NotificationRepository";

export class SaveCampaignUseCase {
    constructor(
        private db: DbD2,
        private repositories: {
            campaignRepository: CampaignRepository;
            notificationRepository: NotificationRepository;
        }
    ) {}

    async execute(campaign: Campaign): Promise<Response<string>> {
        const isEdit = await campaign.isEdit();
        const saveResponse = await this.repositories.campaignRepository.save(campaign);
        this.notifyOnUpdateIfData(campaign, { isEdit });
        return saveResponse;
    }

    private async notifyOnUpdateIfData(
        campaign: Campaign,
        options: { isEdit: boolean }
    ): Promise<boolean> {
        const { campaignRepository, notificationRepository } = this.repositories;
        if (
            options.isEdit &&
            campaign.id &&
            (await campaignRepository.hasDataValues(campaign.id))
        ) {
            const notification = new CampaignNotification(this.db, notificationRepository);
            return notification.sendOnUpdateOrDelete([campaign.getDataSet()], "update");
        } else {
            return false;
        }
    }
}
