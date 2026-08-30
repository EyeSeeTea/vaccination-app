import _ from "lodash";
import { option, optional, string } from "cmd-ts";
import { init } from "d2";
import { getMetadataConfig, MetadataConfig } from "../models/config";
import DbD2 from "../models/db-d2";
import { default as Api } from "d2/api/Api";
import { assert } from "../utils/assert";
import { setupLogs } from "./logging";
import { CampaignD2Query } from "../data/CampaignD2Query";
import { CampaignSummary } from "../domain/entities/CampaignSummary";
import { D2Api } from "../types/d2-api";

export function getD2Api(options: { auth: string; baseUrl: string }) {
    const { auth, baseUrl } = options;
    const [username, password] = auth.split(":");
    return new D2Api({
        baseUrl: baseUrl,
        auth: {
            username: assert(username),
            password: assert(password),
        },
    });
}

export type LegacyApi = { config: MetadataConfig; db: DbD2 };

export type AppApi = { d2Api: D2Api; legacy: LegacyApi };

export async function getAppApi(options: { url: string; auth: string }): Promise<AppApi> {
    const { url, auth } = options;

    const api = new Api();
    Object.assign(api.defaultHeaders, { Authorization: "Basic " + btoa(auth) });

    const d2Api = getD2Api({ auth, baseUrl: url });
    const d2 = await init({ baseUrl: url + "/api" }, { getApi: () => api });
    const db = new DbD2(d2, d2Api);
    const config = await getMetadataConfig(db);

    return {
        d2Api: d2Api,
        legacy: { config, db },
    };
}

export function getDefaultD2Args() {
    return {
        url: option({
            type: string,
            long: "url",
            description: "Target DHIS2 URL",
        }),
        auth: option({
            type: string,
            long: "auth",
            description: "Authentication credentials (USER:PASSWORD)",
        }),
    };
}

export function getSourceTargetD2Args() {
    return {
        sourceUrl: option({
            type: string,
            long: "source-url",
            description: "Source DHIS2 URL",
        }),
        sourceAuth: option({
            type: string,
            long: "source-auth",
            description: "Source authentication credentials (USER:PASSWORD)",
        }),
        targetUrl: option({
            type: string,
            long: "target-url",
            description: "Target DHIS2 URL",
        }),
        targetAuth: option({
            type: string,
            long: "target-auth",
            description: "Target authentication credentials (USER:PASSWORD)",
        }),
    };
}

export async function getCampaignDataSets(options: {
    config: MetadataConfig;
    db: DbD2;
}): Promise<CampaignSummary[]> {
    const res = await new CampaignD2Query(options.config, options.db).list({
        filters: {},
        pagination: { page: 1, pageSize: 1000 },
    });

    const campaigns = _(res.objects)
        .reject(dataSet =>
            Boolean(
                dataSet.name.match(/\btest\b/) ||
                    dataSet.name.match(/DEFAULT/) ||
                    dataSet.name.match(/Pilot/)
            )
        )
        .value();

    const campaignsWithoutPeriods = campaigns.filter(campaign => !campaign.period);
    if (campaignsWithoutPeriods.length > 0) {
        console.warn(
            "The following campaigns do not have a period defined and will be ignored:",
            campaignsWithoutPeriods.map(c => c.name)
        );
    }

    return campaigns;
}

export function getLogsArguments() {
    return {
        logFile: option({
            type: optional(string),
            long: "log-file",
            description: "Path to log file",
        }),
    };
}

export function setupLogsFromArgs(args: { logFile?: string }) {
    if (args.logFile) {
        setupLogs({
            file: args.logFile,
            append: false,
            timestamps: true,
        });
    }
}
