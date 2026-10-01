import { MetadataConfig } from "../../models/config";
import { Maybe } from "../../models/db.types";

type Url = string;

export class Routes {
    constructor(private baseUrl: string, private _config: MetadataConfig) {}

    getDashboardUrl(options: { dashboardId: Maybe<string> }): Url {
        const path = `/dhis-web-dashboard/index.html?redirect=false`;

        if (options.dashboardId) {
            return this.getUrl(`${path}#/${options.dashboardId}`);
        } else {
            return this.getUrl(path);
        }
    }

    getDataEntryUrl(options: {
        campaignId: Maybe<string>;
        orgUnitId: Maybe<string>;
        period: Maybe<Date>;
    }): Url {
        /**
         * Data entry URL for the new Aggregate Data Entry app plugin.
         *
         * Base URL:
         *   /dhis-web-aggregate-data-entry/plugin.html
         *   (overridable via VITE_DATA_ENTRY_PLUGIN_URL, e.g. http://localhost:3000/plugin.html)
         *
         * Supported query parameters:
         * - dataSetId: Dataset ID
         * - orgUnitId: Organisation unit ID
         * - periodId: Period ID (e.g. "20260325" for March 25th, 2026)
         * - attributeOptionComboSelection: "CATEGORYID-OPTIONID"
         */
        const periodId = options.period?.toISOString().split("T")[0]?.replace(/-/g, "");
        // Allow overriding the plugin URL for development (ie: http://localhost:3000/plugin.html)
        const pluginBase =
            import.meta.env.VITE_DATA_ENTRY_PLUGIN_URL ||
            "/dhis-web-aggregate-data-entry/plugin.html";

        return this.getUrl(`${pluginBase}#/`, {
            dataSetId: options.campaignId || "",
            orgUnitId: options.orgUnitId || "",
            periodId: periodId || "",
        });
    }

    getMaintenanceUrl(): Url {
        return this.getUrl("/dhis-web-maintenance/index.html");
    }

    private getUrl(pathOrUrl: string, queryParams?: Record<string, string>): Url {
        const isAbsoluteUrl = /^https?:\/\//.test(pathOrUrl);
        const cleanBaseUrl = this.baseUrl.replace(/\/+$/, "");
        const cleanPath = pathOrUrl.replace(/^\/+/, "");
        const url = isAbsoluteUrl ? pathOrUrl : `${cleanBaseUrl}/${cleanPath}`;

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
