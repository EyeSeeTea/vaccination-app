import { MetadataConfig } from "../../models/config";
import { Maybe } from "../../models/db.types";

type Url = string;

export class Routes {
    constructor(private baseUrl: string, private config: MetadataConfig) {}

    getDashboardUrl(options: { id: Maybe<string> }): Url {
        if (options.id) {
            return this.getUrl(`/dhis-web-dashboard/index.html#/${options.id}`);
        } else {
            return this.getUrl("/dhis-web-dashboard/index.html");
        }
    }

    getDataEntryUrl(options: {
        campaignId: Maybe<string>;
        orgUnitId: Maybe<string>;
        period: Maybe<Date>;
    }): Url {
        /**
         * Data entry URL for the new Aggregate Data Entry app.
         *
         * Base URL:
         *   /dhis-web-aggregate-data-entry/index.html?redirect=false
         *
         * Supported query parameters:
         * - dataSetId: Dataset ID
         * - orgUnitId: Organisation unit ID
         * - periodId: Period ID (e.g. "20260325" for March 25th, 2026)
         * - attributeOptionComboSelection: "CATEGORYID-OPTIONID"
         */
        const periodId = options.period?.toISOString().split("T")[0]?.replace(/-/g, "");

        return this.getUrl("/dhis-web-aggregate-data-entry/index.html?redirect=false#/", {
            dataSetId: options.campaignId || "",
            orgUnitId: options.orgUnitId || "",
            periodId: periodId || "",
        });
    }

    getMaintenanceUrl(): Url {
        return this.getUrl("/dhis-web-maintenance/index.html");
    }

    private getUrl(path: string, queryParams?: Record<string, string>): Url {
        const cleanBaseUrl = this.baseUrl.replace(/\/+$/, "");
        const cleanPath = path.replace(/^\/+/, "");
        const url = `${cleanBaseUrl}/${cleanPath}`;

        if (queryParams) {
            const queryString = Object.entries(queryParams)
                .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                .join("&");
            return `${url}?${queryString}`;
        } else {
            return url;
        }
    }
}
