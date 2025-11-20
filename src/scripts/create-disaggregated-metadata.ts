import _ from "lodash";
import { command, run, option, string } from "cmd-ts";
import { getD2Api } from "./utils";
import { CreateDisaggregatedD2Metadata } from "../data/CreateDisaggregatedD2Metadata";

const program = command({
    name: "create-disaggregated-metadata",
    args: {
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
    },
    handler: async args => {
        const api = getD2Api(args.auth, args.url);
        const res = await new CreateDisaggregatedD2Metadata(api).execute();
        console.debug(res);
    },
});

run(program, process.argv.slice(2));
