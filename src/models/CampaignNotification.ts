import _ from "lodash";
import { NamedObject } from "./db.types";
import i18n from "../locales";
import DbD2 from "./db-d2";

interface DataSetWithName {
    name: string;
}

type Action = "update" | "delete";

export class CampaignNotification {
    destinations = {
        editDeleteCampaignWithData: {
            userGroups: ["Administrators"],
        },
    };

    constructor(private db: DbD2) {}

    public async sendOnUpdateOrDelete(
        dataSets: DataSetWithName[],
        action: Action
    ): Promise<boolean> {
        if (_.isEmpty(dataSets)) return false;

        const { db } = this;
        const actionName = action === "update" ? i18n.t("update") : i18n.t("delete");
        const userName = db.d2.currentUser.displayName;
        const campaignNames = dataSets.map(ds => ds.name);
        const userGroupNames = this.destinations.editDeleteCampaignWithData.userGroups;

        const { userGroups } = await db.getMetadata<{ userGroups: NamedObject[] }>({
            userGroups: {
                fields: { id: true, name: true },
                filters: [`name:in:[${userGroupNames.join(",")}]`],
            },
        });

        if (_.isEmpty(userGroups)) return false;

        await db.sendMessage({
            subject: i18n.t("[RVC] User {{userName}} modified a campaign with data ({{action}})", {
                userName,
                action: actionName,
            }),
            text: [
                i18n.t("User") + ": " + userName,
                i18n.t("Action") + ": " + actionName,
                i18n.t("Campaigns") +
                    ": " +
                    (campaignNames.length === 1
                        ? campaignNames[0]
                        : "\n" + campaignNames.map(name => `  - ${name}`).join("\n")),
            ].join("\n"),
            userGroups,
        });

        return true;
    }
}
