import { D2Api, MetadataPick } from "@eyeseetea/d2-api/2.36";
import fs from "fs";
import _ from "lodash";
import moment from "moment";
import { baseConfig } from "../models/config";
import { Maybe } from "../models/db.types";
import { getCampaignPeriods } from "../models/periods";
import { command, string, optional, option, run } from "cmd-ts";
import { unparse } from "papaparse";

const generateCampaignsReport = command({
    name: "detect-external-orgunits",
    description: "Detect events assigned to organisation units outside their enrollment",
    args: {
        url: option({
            type: string,
            long: "url",
            description: "DHIS2 instance URL",
        }),
        auth: option({
            type: optional(string),
            long: "auth",
            description: "USERNAME:PASSWORD",
        }),
        outputPath: option({
            type: string,
            long: "output",
            description: "Output CSV file path",
        }),
    },
    handler: async args => {
        const [username = "", password = ""] = (args.auth || "").split(":");
        const api = new D2Api({
            baseUrl: args.url,
            auth: { username: username, password: password },
        });

        await new UnusedTeamsReport(api).run(args);
    },
});

export class UnusedTeamsReport {
    constructor(private api: D2Api) {}

    async run(options: { outputPath: string }) {
        console.debug(`Get metadata`);

        const metadata = await this.getMetadata();
        const dataValuesCountByOrgUnit = await this.getDataValuesByOrgUnit();
        const teamsByOrgUnitId = this.getTeamsByOrgUnitId(metadata);

        const rows = metadata.dataSets.flatMap((dataSet): Row[] => {
            return this.getRowsFromDataSet(dataSet, dataValuesCountByOrgUnit, teamsByOrgUnitId);
        });
        console.debug(`Rows: ${rows.length}`);

        const contents = this.getCsvContents(rows);
        fs.writeFileSync(options.outputPath, contents + "\n");
        console.debug(`Report written to ${options.outputPath}`);
    }

    private getCsvContents(rows: Row[]) {
        const data = rows.map(row => ({
            "Campaign Name": row.campaignName,
            "Campaign ID": row.campaignId,
            "Start Date": row.startDate,
            "End Date": row.endDate,
            "Team Name": row.teamName,
            "Team ID": row.teamId,
            "# Doses Administered": row.dosesAdministeredCount,
        }));

        return unparse(data);
    }

    private getRowsFromDataSet(
        dataSet: DataSet,
        dataValuesCountByOrgUnit: Record<string, number>,
        teamsByOrgUnitId: Record<string, CategoryOption[]>
    ): Row[] {
        const isCampaign = dataSet.attributeValues.some(av => {
            return av.attribute.code === baseConfig.attributeCodeForApp && av.value === "true";
        });
        if (!isCampaign) return [];

        const periods = getCampaignPeriods(dataSet);

        const teams = _(dataSet.organisationUnits)
            .flatMap(ou => teamsByOrgUnitId[ou.id])
            .compact()
            .uniqBy(team => team.id)
            .sortBy(team => team.name)
            .value();

        const campaign: Campaign = {
            id: dataSet.id,
            name: dataSet.name,
            startDate: periods?.startDate,
            endDate: periods?.endDate,
            teams: teams,
        };

        return teams.map((team): Row => {
            const dosesAdministeredCount = _(team.organisationUnits)
                .map(ou => dataValuesCountByOrgUnit[ou.id] || 0)
                .sum();

            return {
                campaignName: campaign.name,
                campaignId: campaign.id,
                startDate: toStrDate(campaign.startDate),
                endDate: toStrDate(campaign.endDate),
                teamName: team.name,
                teamId: team.id,
                dosesAdministeredCount: dosesAdministeredCount,
            };
        });
    }

    private getTeamsByOrgUnitId(metadata: Metadata) {
        return _(metadata.categoryOptions)
            .flatMap(co => co.organisationUnits.map(ou => ({ orgUnitId: ou.id, co: co })))
            .groupBy(o => o.orgUnitId)
            .mapValues(o => o.map(x => x.co))
            .value();
    }

    private async getDataValuesByOrgUnit() {
        const { dataValues } = await this.api.dataValues
            .getSet({
                dataSet: [],
                dataElementGroup: [],
                startDate: "1950",
                endDate: "2050",
                orgUnit: ["zOyMxdCLXBM"],
                children: true,
                // @ts-expect-error: dataElement not in this version of d2-api
                dataElement: "mkgnDxyksQS", // Vaccine doses administered
            })
            .getData();

        console.debug(`DataValues: ${dataValues.length}`);

        const dataValuesCountByOrgUnit = _(dataValues)
            .filter(dv => dv.value !== "0")
            .countBy(dv => dv.orgUnit)
            .value();
        return dataValuesCountByOrgUnit;
    }

    private async getMetadata(): Promise<Metadata> {
        const metadata = await this.api.metadata.get(query).getData();
        console.debug(`DataSets: ${metadata.dataSets.length}`);
        console.debug(`Teams: ${metadata.categoryOptions.length}`);
        return metadata;
    }
}

type Id = string;

type Team = {
    id: Id;
    name: string;
};

type Campaign = {
    id: Id;
    name: string;
    startDate: Date | undefined;
    endDate: Date | undefined;
    teams: Team[];
};

type Row = {
    campaignName: string;
    campaignId: Id;
    startDate: string;
    endDate: string;
    teamName: string;
    teamId: Id;
    dosesAdministeredCount: number;
};

const query = {
    dataSets: {
        fields: {
            id: true,
            name: true,
            dataInputPeriods: { period: { id: true } },
            attributeValues: { attribute: { code: true }, value: true },
            organisationUnits: true,
        } as const,
        order: "name:asc",
    },
    categoryOptions: {
        fields: {
            id: true,
            name: true,
            organisationUnits: { id: true },
        } as const,
        filter: {
            "categories.code": { eq: baseConfig.categoryCodeForTeams },
        },
    },
};

type DataSet = Metadata["dataSets"][number];

type CategoryOption = Metadata["categoryOptions"][number];

type Metadata = MetadataPick<typeof query>;

function toStrDate(date: Maybe<Date>): string {
    return date ? moment(date).format("YYYY-MM-DD") : "-";
}

function main() {
    const args = process.argv.slice(2);
    run(generateCampaignsReport, args);
}

main();
