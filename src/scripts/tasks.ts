import _ from "lodash";
import fs from "fs";
import * as CsvWriter from "csv-writer";
import path from "path";
import { command, run, string, option, subcommands, Type, flag } from "cmd-ts";
import { D2Api, DataValueSetsDataValue, Id, MetadataPick } from "@eyeseetea/d2-api/2.36";
import { baseConfig } from "../models/config";
import { NamedRef } from "../models/db.types";
import { promiseMap } from "../utils/promises";

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
    preventiveDataSets = [
        "CAR - PCV/Penta November",
        "Dasenech Emergency project",
        "RVC NADIAGOU : PCV13/PENTA/VAR/VAA/MEN A/ROTA",
        "RVC multiantigenes de deplacé de Yamba à Fada le Fevrier 2022",
        "RVC_Tambura_Measles_March-2022",
    ];
    constructor(private api: D2Api, private options: Options) {}

    async execute() {
        const { api, options } = this;
        const metadata = await api.metadata.get(metadataQuery).getData();
        const aocMapping = this.getAttributeOptionComboMapping(metadata);
        const dataValues = await this.getDataValues(metadata);
        const data = this.getMappedDataValues(metadata, dataValues, aocMapping);
        const dataValuesMapped = _.compact(data.map(o => o.dataValue));
        await this.persistDataValues(dataValuesMapped, options, api);
        await this.saveReport(data.map(o => o.row));
        debug(`Data values: original=${dataValues.length}, mapped=${dataValuesMapped.length}`);
    }

    private async persistDataValues(
        dataValuesWithAocMapped: DataValueSetsDataValue[],
        options: Options,
        api: D2Api
    ) {
        const groups = _.chunk(dataValuesWithAocMapped, 100_000);

        for (const [index, dataValuesGroup] of groups.entries()) {
            const payload = { dataValues: dataValuesGroup };
            const json = JSON.stringify(payload, null, 4);
            const paddedIndex = padDigits(index, 4);
            const outputPath = options.outputPath.replace(/\.json$/, `-${paddedIndex}.json`);
            fs.writeFileSync(outputPath, json);
            debug(`Payload [${index + 1}/${groups.length}]: ${outputPath}`);

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
        metadata: Metadata,
        dataValues: DataValueSetsDataValue[],
        aocMapping: CampaignCocMapping
    ) {
        const dataSetsByName = _.keyBy(metadata.dataSets, ds => ds.name.trim());
        const names = this.preventiveDataSets.join(", ");
        debug(`All data sets will be considered reactive, except for: ${names}`);

        const preventiveOrgUnitIds = new Set(
            _(this.preventiveDataSets)
                .map(dataSetName => _(dataSetsByName).getOrFail(dataSetName))
                .flatMap(dataSet => dataSet.organisationUnits)
                .value()
                .map(ou => ou.id)
        );

        const orgUnitsById = byId(metadata.organisationUnits);
        const dataElementsById = byId(metadata.dataElements);
        const cocsById = byId(_.flatMap(metadata.categoryCombos, cc => cc.categoryOptionCombos));

        return _(dataValues)
            .map(
                (dv): { row: ReportRow; dataValue: DataValueSetsDataValue | undefined } => {
                    const isPreventiveOrgUnit = preventiveOrgUnitIds.has(dv.orgUnit);
                    const campaignType = isPreventiveOrgUnit ? "preventive" : "reactive";
                    const mapping = aocMapping[campaignType];
                    const aocMapped = mapping[dv.attributeOptionCombo];

                    const base: Omit<ReportRow, "toAoc"> = {
                        orgUnit: formatObj(orgUnitsById[dv.orgUnit]),
                        dataElement: formatObj(dataElementsById[dv.dataElement]),
                        period: dv.period,
                        value: dv.value,
                        type: campaignType,
                        fromAoc: formatObj(cocsById[dv.attributeOptionCombo]),
                    };

                    if (!aocMapped) {
                        const row: ReportRow = { ...base, toAoc: "NOT FOUND" };
                        debug(`Cannot map: ${row.orgUnit} - ${row.fromAoc}`);
                        return { row, dataValue: undefined };
                    } else {
                        const row: ReportRow = { ...base, toAoc: formatObj(cocsById[aocMapped]) };
                        const dataValueUpdated = { ...dv, attributeOptionCombo: aocMapped };
                        return { row, dataValue: dataValueUpdated };
                    }
                }
            )
            .compact()
            .value();
    }

    private async saveReport(rows: ReportRow[]) {
        const header: Array<{ id: Attr; title: string }> = [
            { id: "orgUnit", title: "Org Unit" },
            { id: "dataElement", title: "Data element" },
            { id: "period", title: "Period" },
            { id: "value", title: "Value" },
            { id: "type", title: "Type" },
            { id: "fromAoc", title: "From" },
            { id: "toAoc", title: "To" },
        ];

        const chunks = _(rows)
            .chunk(1e6)
            .map((chunk, index) => [chunk, index + 1] as const)
            .value();

        await promiseMap(chunks, ([rowChunk, index]) => {
            const csvPath = `update-datavalues-disaggregation-${index}.csv`;
            const obj = CsvWriter.createObjectCsvWriter({ path: csvPath, header });
            debug(`Report [${index}/${chunks.length}]: ${csvPath}`);
            return obj.writeRecords(rowChunk);
        });
    }

    private async getDataValues(metadata: Metadata): Promise<DataValueSetsDataValue[]> {
        const dataElementGroupAll = _(metadata.dataElementGroups)
            .keyBy(deg => deg.code)
            .getOrFail(baseConfig.dataElementGroupCodeForAntigens);

        debug(`Get data values from the API`);
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

    getAttributeOptionComboMapping(metadata: Metadata): CampaignCocMapping {
        const defaultCategoryCombo = _(metadata.categoryCombos)
            .keyBy(cc => cc.name)
            .getOrFail("default");

        const categoryCombosByCode = _.keyBy(metadata.categoryCombos, cc => cc.code);
        const campaignTypeCombo = _(categoryCombosByCode).getOrFail(
            baseConfig.categoryCodeForCampaignType
        );

        const { categoryOptionCodeForReactive, categoryOptionCodeForPreventive } = baseConfig;

        const cocForReactive = _(campaignTypeCombo.categoryOptionCombos)
            .filter(coc =>
                _(coc.categoryOptions).some(co => co.code === categoryOptionCodeForReactive)
            )
            .getOrFail(0);

        const cocForPreventive = _(campaignTypeCombo.categoryOptionCombos)
            .filter(coc =>
                _(coc.categoryOptions).some(co => co.code === categoryOptionCodeForPreventive)
            )
            .getOrFail(0);

        const teamReactiveCategoryCombo = _(categoryCombosByCode).getOrFail(
            baseConfig.categoryComboCodeForTeamReactive
        );

        const teamPreventiveCategoryCombo = _(categoryCombosByCode).getOrFail(
            baseConfig.categoryComboCodeForTeamPreventive
        );

        const defaultCoc = _(defaultCategoryCombo.categoryOptionCombos).getOrFail(0);

        return {
            reactive: {
                [defaultCoc.id]: cocForReactive.id,
                ...this.getMappingForCategoryCombo(metadata, teamReactiveCategoryCombo),
            },
            preventive: {
                [defaultCoc.id]: cocForPreventive.id,
                ...this.getMappingForCategoryCombo(metadata, teamPreventiveCategoryCombo),
            },
        };
    }

    private getMappingForCategoryCombo(
        metadata: Metadata,
        categoryCombo: Metadata["categoryCombos"][number]
    ): CocMapping {
        const teamCategory = _(metadata.categories)
            .keyBy(cc => cc.code)
            .getOrFail(baseConfig.categoryCodeForTeams);

        const teamCategoryOptionIds = new Set(teamCategory.categoryOptions.map(co => co.id));

        const categoryCombosByCode = _.keyBy(metadata.categoryCombos, cc => cc.code);

        const teamCategoryCombo = _(categoryCombosByCode).getOrFail(
            baseConfig.categoryComboCodeForTeams
        );

        const categoryOptionMapping: Record<CategoryOptionId, CocId> = _(
            categoryCombo.categoryOptionCombos
        )
            .map(coc => {
                const teamCategoryOption = coc.categoryOptions.find(co =>
                    teamCategoryOptionIds.has(co.id)
                );
                if (!teamCategoryOption) throw new Error();
                return [teamCategoryOption.id, coc.id] as [CategoryOptionId, CocId];
            })
            .fromPairs()
            .value();

        const categoryComboMapping = _(teamCategoryCombo.categoryOptionCombos)
            .map(coc => {
                const categoryOption = _.first(coc.categoryOptions);
                if (!categoryOption) throw new Error("Category options empty");
                const teamReactiveCocId = _(categoryOptionMapping).getOrFail(categoryOption.id);
                return [coc.id, teamReactiveCocId] as [CocId, CocId];
            })
            .compact()
            .fromPairs()
            .value();

        return categoryComboMapping;
    }
}

const metadataQuery = {
    dataSets: {
        fields: { id: true, name: true, organisationUnits: { id: true } },
    },
    dataElements: {
        fields: { id: true, name: true },
    },
    organisationUnits: {
        fields: { id: true, name: true },
    },
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
                name: true,
                categoryOptions: { id: true, code: true },
            },
        },
    },
} as const;

type Metadata = MetadataPick<typeof metadataQuery>;

type CocId = Id;
type CategoryOptionId = Id;
type CocMapping = Record<CocId, CocId>;
type CampaignCocMapping = { reactive: CocMapping; preventive: CocMapping };

type Attr = "orgUnit" | "dataElement" | "period" | "value" | "type" | "fromAoc" | "toAoc";
type ReportRow = Record<Attr, string>;

const byId = <T extends NamedRef>(objs: T[]) => _.fromPairs(objs.map(o => [o.id, o] as [Id, T]));

const formatObj = (obj: NamedRef) => `${obj.name.trim()} [${obj.id}]`;

function debug(msg: string) {
    console.debug(msg);
}

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
