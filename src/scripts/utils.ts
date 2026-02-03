import _ from "lodash";
import { D2Api } from "@eyeseetea/d2-api/2.36";
import { option, string } from "cmd-ts";
import { init } from "d2";
import { getMetadataConfig, MetadataConfig } from "../models/config";
import DbD2 from "../models/db-d2";
import { default as Api } from "d2/api/Api";
import { assert } from "../utils/assert";
import { list } from "../models/datasets";

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

    const d2 = await init({ baseUrl: url + "/api" }, { getApi: () => api });
    const db = new DbD2(d2);
    const config = await getMetadataConfig(db);

    return {
        d2Api: getD2Api({ auth, baseUrl: url }),
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

type CampaignDataSet = {
    id: string;
    name: string;
    organisationUnits: Array<{ id: string }>;
};

export async function getCampaignDataSets(options: {
    config: MetadataConfig;
    db: DbD2;
}): Promise<CampaignDataSet[]> {
    const res = await list(options.config, options.db.d2, {}, { pageSize: 1_000 });

    return _(res.objects as CampaignDataSet[])
        .reject(dataSet =>
            Boolean(
                dataSet.name.match(/\btest\b/) ||
                    dataSet.name.match(/DEFAULT/) ||
                    dataSet.name.match(/Pilot/)
            )
        )
        .value();
}
