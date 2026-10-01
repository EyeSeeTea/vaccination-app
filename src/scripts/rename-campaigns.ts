import { NamedRef } from "../models/db.types";
import { Struct } from "../models/Struct";

import _ from "lodash";
import XLSX from "xlsx";
import { readFileSync } from "fs";
import { D2Api, MetadataResponse, Ref } from "../types/d2-api";

/* https://app.clickup.com/t/8696b6qvg

Rename campaigns metadata from an Excel file.
*/

async function renameMetadataCampaignsFromXlsx(
    renameEntriesXlsxPath: string,
    baseUrl: string,
    auth: string
) {
    const api = getD2Api(auth, baseUrl);
    const campaigns = getCampaignsFromExcel(renameEntriesXlsxPath);
    const dataSets = await getDataSets(api);

    await updateMetadata(campaigns, dataSets, api);
}

type DataSet = NamedRef;

// Models that include the campaign name
const metadataModels = [
    "categoryOptionCombos",
    "categoryOptions",
    "dashboards",
    "dataEntryForms",
    "dataSets",
    "visualizations",
] as const;

type MetadataModel = typeof metadataModels[number];

// This type should include all props where the campaign name is used
type MetadataItem = {
    id: string;
    name: string;
    shortName?: string;
    organisationUnits?: Ref[]; // No need to rename, but we need to remove duplicates
};

type MetadataRes = Metadata & { system: unknown };

type Metadata = Record<MetadataModel, MetadataItem[]>;

async function updateMetadata(campaigns: Campaign[], dataSets: DataSet[], api: D2Api) {
    for (const campaign of campaigns) {
        const dataSet = dataSets.find(dataSet => dataSet.id === campaign.id);

        if (!dataSet) {
            console.error(`Data set not found: id='${campaign.id}'`);
        } else {
            const dataSetInfo = `${dataSet.id}:${dataSet.name}`;
            console.debug(`Rename ${dataSetInfo}: ${campaign.name} -> ${campaign.newName}`);

            await renameMetadata(api, {
                from: dataSet.name,
                to: campaign.newName,
                dryRun: (process.env["DRY_RUN"] ?? "false") === "true",
            });
        }
    }
}

async function renameMetadata(
    api: D2Api,
    options: { from: string; to: string; dryRun: boolean }
): Promise<{ success: boolean }> {
    const metadata = await getMetadata(api, options);
    const metadataRenamed = renameObjects(metadata, options);
    const emptyMetadata = _(metadataRenamed).values().flatten().isEmpty();

    if (emptyMetadata) {
        console.debug(`No metadata to post`);
        return { success: true };
    }

    const res = await post(api, metadataRenamed, options);
    if (!res) return { success: false };

    console.debug(`Post renamed metadata: ${res.status}`);
    const success = res.status === "OK";

    if (!success) {
        console.error(JSON.stringify(res, null, 4));
    }

    return { success: success };
}

async function post(
    api: D2Api,
    metadataRenamed: Metadata,
    options: { dryRun: boolean }
): Promise<MetadataResponse | undefined> {
    try {
        return await api.metadata
            .post(metadataRenamed, {
                importMode: options.dryRun ? "VALIDATE" : "COMMIT",
                skipSharing: true, // Metadata will contain references to deleted user/userGroups
            })
            .getData();
    } catch (err: any) {
        if ("response" in err) {
            console.error(JSON.stringify(err.response.data.response, null, 4));
        }
    }
}

function renameObjects(
    metadata: Metadata,
    options: { from: string; to: string; dryRun: boolean }
): Metadata {
    return _(metadata)
        .mapValues(items => {
            return _(items)
                .map((item): typeof item | undefined => {
                    const newItem = {
                        ...item,
                        name: item.name.replace(options.from, options.to),
                        shortName: item.shortName?.replace(options.from, options.to),
                        // There are duplicated OU references that make the POST fail, fix them.
                        organisationUnits: item.organisationUnits
                            ? _.uniqBy(item.organisationUnits, ou => ou.id)
                            : undefined,
                    };
                    const hasChanges = !_.isEqual(item, _.omitBy(newItem, _.isUndefined));

                    return hasChanges ? newItem : undefined;
                })
                .compact()
                .value();
        })
        .value();
}

async function getMetadata(
    api: D2Api,
    options: { from: string; to: string; dryRun: boolean }
): Promise<Metadata> {
    const fields = _(metadataModels)
        .map(model => [`${model}:fields`, ":owner"] as [string, string])
        .fromPairs()
        .value();

    const metadata = await api
        .get<MetadataRes>("/metadata", {
            ...fields,
            filter: `name:like:${options.from}`,
        })
        .getData()
        .then(({ system: _system, ...metadata }) => metadata);

    const msg = _(metadata)
        .toPairs()
        .sortBy(([model, _items]) => model)
        .map(([model, items]) => `${model} (${items.length})`)
        .join(", ");

    console.debug(`Models: ${msg || "-"}`);

    return metadata;
}

type CampaignProps = {
    id: string;
    name: string;
    year: number; // YY
    month: number; // MM
    type: string; // "PRE" | "REAC"
    mission: string;
    project: string;
};

class Campaign extends Struct<CampaignProps>() {
    get newName() {
        return [
            pad2Digits(this.year), //
            pad2Digits(this.month),
            this.type,
            this.project,
        ].join("-");
    }
}

async function getDataSets(api: D2Api): Promise<DataSet[]> {
    const res = await api.metadata
        .get({
            dataSets: {
                fields: { id: true, name: true },
            },
        })
        .getData();

    console.debug(`Data sets from ${api.baseUrl}: ${res.dataSets.length}`);
    return res.dataSets;
}

function getD2Api(auth: string, baseUrl: string) {
    const [username = "", password = ""] = auth.split(":");
    return new D2Api({ baseUrl: baseUrl, auth: { username, password } });
}

function getCampaignsFromExcel(filePath: string): Campaign[] {
    const fileBuffer = readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) throw new Error("No sheet found");

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

    const campaigns = rows.slice(2).map((row): Campaign => {
        const [currentName, id, year, month, type, mission, project] = row;

        if (!currentName || !id || !year || !month || !type || !mission || !project)
            throw new Error("Invalid row");

        return Campaign.create({
            id: id.trim() || "",
            name: currentName.trim(),
            year: parseInt(year),
            month: parseInt(month),
            type: type.trim(),
            mission: mission.trim(),
            project: project.trim(),
        });
    });

    console.debug(`Campaigns from ${filePath}: ${campaigns.length}`);

    return campaigns;
}

function pad2Digits(value: number) {
    return value.toString().padStart(2, "0");
}

const [filePath, baseUrl, auth] = process.argv.slice(2);

if (!(filePath && baseUrl && auth)) {
    console.debug(`Usage: ${process.argv[1]} <campaignsXlsx> <baseUrl> <user:password>`);
} else {
    renameMetadataCampaignsFromXlsx(filePath, baseUrl, auth);
}
