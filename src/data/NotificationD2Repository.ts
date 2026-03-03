import { Notification } from "../domain/entities/Notification";
import { NotificationRepository } from "../domain/repositories/NotificationRepository";
import { D2Api } from "../types/d2-api";

export class NotificationD2Repository implements NotificationRepository {
    constructor(private api: D2Api) {}

    async send(notification: Notification): Promise<void> {
        await this.api.messageConversations
            .post({
                subject: notification.subject,
                text: notification.text,
                userGroups: notification.userGroupIds.map(id => ({ id })),
            })
            .getData();
    }
}
