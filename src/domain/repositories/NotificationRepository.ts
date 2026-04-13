import { Notification } from "../entities/Notification";

export interface NotificationRepository {
    send(notification: Notification): Promise<void>;
}
