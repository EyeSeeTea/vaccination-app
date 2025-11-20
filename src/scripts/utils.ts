import { D2Api } from "@eyeseetea/d2-api/2.36";
import { option, string } from "cmd-ts";
import { init } from "d2";
import { getMetadataConfig } from "../models/config";
import DbD2 from "../models/db-d2";
import { default as Api } from "d2/api/Api";

export function getD2Api(auth: string, baseUrl: string) {
    const [username = "", password = ""] = auth.split(":");
    return new D2Api({ baseUrl: baseUrl, auth: { username, password } });
}

export async function getD2LegacyApi(options: { url: string; auth: string }) {
    const { url, auth } = options;
    const api = new Api();
    Object.assign(api.defaultHeaders, { Authorization: "Basic " + btoa(auth) });
    const d2 = await init({ baseUrl: url + "/api" }, { getApi: () => api });
    const db = new DbD2(d2);
    const config = await getMetadataConfig(db);

    return { config: config, db: db };
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
