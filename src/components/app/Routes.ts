import { Maybe } from "../../models/db.types";

type Url = string;

export class Routes {
    constructor(private baseUrl: string) {}

    getDashboardUrl(options: { id: Maybe<string> }): Url {
        if (options.id) {
            return this.getUrl(`/dhis-web-dashboard/index.html#/${options.id}`);
        } else {
            return this.getUrl("/dhis-web-dashboard/index.html");
        }
    }

    getDataEntryUrl(): Url {
        return this.getUrl(`/dhis-web-dataentry/index.action`);
    }

    getMaintenanceUrl(): Url {
        return this.getUrl("/dhis-web-maintenance/index.html");
    }

    private getUrl(path: string): Url {
        const cleanBaseUrl = this.baseUrl.replace(/\/+$/, "");
        const cleanPath = path.replace(/^\/+/, "");
        return `${cleanBaseUrl}/${cleanPath}`;
    }
}
