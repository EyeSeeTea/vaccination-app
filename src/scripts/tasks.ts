import _ from "lodash";
import fs from "fs";
import path from "path";
import { command, run, string, option, subcommands, Type, flag } from "cmd-ts";
import { D2Api, DataValueSetsDataValue, Id, MetadataPick } from "@eyeseetea/d2-api/2.36";
import { baseConfig } from "../models/config";

function main() {
    const updateDataValuesDisaggregation = command({
        name: "Update data values disaggregation",
        description:
            "Update disaggregation (preventive/reactive) for data values (vaccination and population)",
        args: {
            url: option({
                type: string,
                long: "url",
                description: "DHIS2 Instance URL: http://USERNAME:PASSWORD@HOST:PORT",
            }),
            orgUnitsIds: option({
                type: StringsSeparatedByCommas,
                long: "org-units-ids",
                description: "Organisation units roots (comma-separated IDs)",
            }),
            outputPath: option({
                type: string,
                long: "output-path",
                description: "Output path with data values JSON",
            }),
            post: flag({
                long: "post",
                description: "Post data values",
            }),
            postDryRun: flag({
                long: "post-dry-run",
                description: "Post data values with dryRun enabled",
            }),
        },
        handler: async args => {
            const api = getD2Api(args.url);
            await new UpdateCampaignsDisaggregation(api, args).execute();
        },
    });

    const mainCmd = subcommands({
        name: path.basename(__filename),
        cmds: {
            "update-datavalues-disaggregation": updateDataValuesDisaggregation,
        },
    });

    run(mainCmd, process.argv.slice(2));
}

const StringsSeparatedByCommas: Type<string, string[]> = {
    async from(str) {
        return str.split(",");
    },
};

interface Options {
    orgUnitsIds: Id[];
    outputPath: string;
    post: boolean;
    postDryRun: boolean;
}

class UpdateCampaignsDisaggregation {
    constructor(private api: D2Api, private options: Options) {}

    async execute() {
        const { api, options } = this;
        const metadata = await api.metadata.get(metadataQuery).getData();
        const aocMapping = this.getAoCMapping(metadata);
        const dataValues = await this.getDataValues(metadata);
        const dataValuesWithAocMapped = this.getMappedDataValues(dataValues, aocMapping);
        debug(`Mapped: ${dataValues.length} -> ${dataValuesWithAocMapped.length}`);

        await this.persistDataValues(dataValuesWithAocMapped, options, api);
    }

    private async persistDataValues(
        dataValuesWithAocMapped: DataValueSetsDataValue[],
        options: Options,
        api: D2Api
    ) {
        const groups = _.chunk(dataValuesWithAocMapped, 100000);

        for (const [index, dataValuesGroup] of groups.entries()) {
            const payload = { dataValues: dataValuesGroup };
            const json = JSON.stringify(payload, null, 4);
            const paddedIndex = padDigits(index, 4);
            const outputPath = options.outputPath.replace(/\.json$/, `-${paddedIndex}.json`);
            fs.writeFileSync(outputPath, json);
            debug(`Written [${index + 1}/${groups.length}]: ${outputPath}`);

            if (options.post) {
                debug(`Post data values: ${dataValuesGroup.length}`);
                const res = await api.dataValues
                    .postSet({ skipAudit: true, force: true, dryRun: options.postDryRun }, payload)
                    .getData();
                debug(`Response: ${res.status} - ${JSON.stringify(res.importCount)}`);
            }
        }
    }

    private getMappedDataValues(
        dataValues: DataValueSetsDataValue[],
        aocMapping: Record<string, string>
    ) {
        return _(dataValues)
            .map(
                (dataValue): DataValueSetsDataValue | undefined => {
                    const attributeOptionComboMapped = aocMapping[dataValue.attributeOptionCombo];

                    if (!attributeOptionComboMapped) {
                        const msg = `Cannot map aoc: ${dataValue.attributeOptionCombo}`;
                        debug(msg);
                    } else {
                        return {
                            ...dataValue,
                            attributeOptionCombo: attributeOptionComboMapped,
                        };
                    }
                }
            )
            .compact()
            .value();
    }

    private async getDataValues(metadata: Metadata): Promise<DataValueSetsDataValue[]> {
        const dataElementGroupAll = _(metadata.dataElementGroups)
            .keyBy(deg => deg.code)
            .getOrFail(baseConfig.dataElementGroupCodeForAntigens);

        debug("Get data values");
        const { dataValues } = await this.api.dataValues
            .getSet({
                orgUnit: this.options.orgUnitsIds,
                children: true,
                dataSet: [],
                dataElementGroup: [dataElementGroupAll.id],
                startDate: "1970",
                endDate: (new Date().getFullYear() + 1).toString(),
            })
            .getData();

        return dataValues;
    }

    getAoCMapping(metadata: Metadata): Record<CocId, CocId> {
        const defaultCategoryCombo = _(metadata.categoryCombos)
            .keyBy(cc => cc.name)
            .getOrFail("default");

        const teamCategory = _(metadata.categories)
            .keyBy(cc => cc.code)
            .getOrFail(baseConfig.categoryCodeForTeams);

        const teamCategoryOptionIds = new Set(teamCategory.categoryOptions.map(co => co.id));

        const categoryCombosByCode = _.keyBy(metadata.categoryCombos, cc => cc.code);
        const campaignTypeCombo = _(categoryCombosByCode).getOrFail(
            baseConfig.categoryCodeForCampaignType
        );

        const cocForReactive = _(campaignTypeCombo.categoryOptionCombos)
            .filter(coc =>
                _(coc.categoryOptions).some(
                    co => co.code === baseConfig.categoryOptionCodeForReactive
                )
            )
            .getOrFail(0);

        const teamCategoryCombo = _(categoryCombosByCode).getOrFail(
            baseConfig.categoryComboCodeForTeams
        );

        const teamReactiveCategoryCombo = _(categoryCombosByCode).getOrFail(
            baseConfig.categoryComboCodeForTeamReactive
        );

        const defaultCoc = _(defaultCategoryCombo.categoryOptionCombos).getOrFail(0);

        debug("Create teamReactiveCategoryCombo mapping");
        const mapping1: Record<CategoryOptionId, CocId> = _(
            teamReactiveCategoryCombo.categoryOptionCombos
        )
            .map(coc => {
                const teamCategoryOption = coc.categoryOptions.find(co =>
                    teamCategoryOptionIds.has(co.id)
                );
                if (!teamCategoryOption) throw new Error();
                return [teamCategoryOption.id, coc.id] as [Id, Id];
            })
            .fromPairs()
            .value();

        debug("Create teamCategoryCombo mapping");
        const mapping2 = _(teamCategoryCombo.categoryOptionCombos)
            .map(coc => {
                const categoryOption = _.first(coc.categoryOptions);
                if (!categoryOption) throw new Error();
                const teamReactiveCocId = _(mapping1).getOrFail(categoryOption.id);
                return [coc.id, teamReactiveCocId] as [CocId, CocId];
            })
            .compact()
            .fromPairs()
            .value();

        return {
            [defaultCoc.id]: cocForReactive.id,
            ...mapping2,
        };
    }
}

const metadataQuery = {
    dataElementGroups: {
        fields: { id: true, code: true },
    },
    categories: {
        fields: { id: true, code: true, categoryOptions: true },
    },
    categoryCombos: {
        fields: {
            id: true,
            name: true,
            code: true,
            categoryOptionCombos: {
                id: true,
                categoryOptions: { id: true, code: true },
            },
        },
    },
} as const;

type Metadata = MetadataPick<typeof metadataQuery>;

function debug(msg: string) {
    process.stderr.write(msg + "\n");
}

type CocId = Id;
type CategoryOptionId = Id;

function padDigits(number: number, digits: number) {
    return Array(Math.max(digits - String(number).length + 1, 0)).join("0") + number;
}

function getD2Api(baseUrl: string): D2Api {
    const url = new URL(baseUrl);
    const decode = decodeURIComponent;
    const auth = { username: decode(url.username), password: decode(url.password) };
    return new D2Api({ baseUrl: url.origin + url.pathname, auth });
}

main();
