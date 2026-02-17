/**
 * Delete deprecated metadata and their dependencies. Entities to delete:
 *
 * - deprecated category combos (+ categoryOptionCombos + associated datavalues+audits)
 *     category combos disaggregated by antigen and/or doses
 * - deprecated data elements (+ associated datavalues+audits)
 *    global data elements that were not disaggregated by antigen and/or doses
 **/

import _ from "lodash";
import { command, flag, option, run } from "cmd-ts";
import { dataElementsInfo } from "../models/D2CampaignMetadata";
import { D2Api, D2CategoryComboSchema, Ref, SelectedPick } from "../types/d2-api";
import { runPsql } from "./psql";
import { getAppApi, getDefaultD2Args, getLogsArguments } from "./utils";
import fs from "fs";
import path from "path";

const program = command({
    name: "delete-old-disaggregations",
    args: {
        ...getDefaultD2Args(),
        postgresUrl: option({
            long: "postgres-url",
            description:
                "PostgreSQL connection string. Ex: postgresql://user:password@localhost:5432/dhis2",
        }),
        delete: flag({
            long: "delete",
            description: "Actually delete the data. By default, the script runs in dry-run mode",
        }),
        ...getLogsArguments(),
    },
    handler: async args => {
        const appApi = await getAppApi({ auth: args.auth, url: args.url });

        new DeleteOldDisaggregations(appApi.d2Api, args.postgresUrl, {
            delete: args.delete,
        }).execute();
    },
});

run(program, process.argv.slice(2));

class DeleteOldDisaggregations {
    globalOrgUnitId = "zOyMxdCLXBM"; // MSF

    // Deprecated data elements were disaggregated by antigen and/or doses
    deprecatedCategoryCombos = [
        "RVC_ANTIGEN",
        "RVC_ANTIGEN_SEVERITY",
        "RVC_ANTIGEN_TYPE",
        "RVC_ANTIGEN_TYPE_SEVERITY",
        "RVC_ANTIGEN_AGE_GROUP",
        "RVC_ANTIGEN_DOSE_AGE_GROUP",
        "RVC_ANTIGEN_DOSE_AGE_GROUP_GENDER",
        "RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP",
        "RVC_ANTIGEN_DOSE_AGE_GROUP_DISTATUS",
        "RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_GENDER",
        "RVC_ANTIGEN_DOSE_AGE_GROUP_GENDER_DISTATUS",
        "RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_DISTATUS",
        "RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_WS",
        "RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_GENDER_DISTATUS",
        "RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_GENDER_WS",
        "RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_DISTATUS_WS",
        "RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_GENDER_DISTATUS_WS",
    ];

    dryRun: boolean;

    constructor(private api: D2Api, private psqlUrl: string, options: { delete: boolean }) {
        this.dryRun = !options.delete;
    }

    async execute(): Promise<void> {
        await this.insertIndexes();
        await this.deleteCategoryCombos();
        await this.deleteDataElements();
        await this.deleteDepecratedIndicators();
    }

    private async insertIndexes(): Promise<void> {
        this.debug(`Insert indexes to speed up deletions`);

        await runPsql({ url: this.psqlUrl, dryRun: false }, async query => {
            const sql = this.getSql("indexes.sql");
            await query(sql);
        });
    }

    private get psqlOptions() {
        return { url: this.psqlUrl, dryRun: this.dryRun };
    }

    private getDeprecatedDataElementCodes(): string[] {
        return dataElementsInfo
            .filter(dataElement => dataElement.disaggregations.includes("antigen"))
            .map(dataElement => dataElement.modelCode);
    }

    private getDeprecatedIndicatorCodes(): string[] {
        return dataElementsInfo
            .filter(dataElement => dataElement.disaggregations.includes("antigen"))
            .map(dataElement => dataElement.modelCode);
    }

    private async deleteDataValuesForDeprecatedDataElements(
        dataElements: Array<{ code: string }>
    ): Promise<void> {
        this.debug(`Deleting data values`);
        const dataElementCodes = dataElements.map(de => de.code);

        const res1 = await runPsql(this.psqlOptions, async query => {
            return query(
                `
                    DELETE FROM datavalue
                    USING dataelement
                    WHERE datavalue.dataelementid = dataelement.dataelementid
                    AND dataelement.code = ANY($1)
            `,
                [dataElementCodes]
            );
        });
        this.debug(`Deleted data values: ${res1?.rowCount}`);

        this.debug(`Deleting data values audits`);
        const res2 = await runPsql(this.psqlOptions, async query => {
            return query(
                `
                    DELETE FROM datavalueaudit
                    USING dataelement
                    WHERE datavalueaudit.dataelementid = dataelement.dataelementid
                    AND dataelement.code = ANY($1)
                `,
                [dataElementCodes]
            );
        });
        this.debug(`Deleted data values audits: ${res2?.rowCount}`);
    }

    private getSql(filename: string): string {
        const sqlPath = path.join(__dirname, "sql", filename);
        return fs.readFileSync(sqlPath, "utf-8");
    }

    private async deleteCategoryCombos(): Promise<void> {
        const categoryCombos = await this.getDeprecatedCategoryCombos();
        const codes = categoryCombos.map(cc => cc.code).join(", ");
        this.debug(`Found ${categoryCombos.length} deprecated category combos:\n${codes}`);

        for (const categoryCombo of categoryCombos) {
            this.debug(`Processing category combo ${categoryCombo.code}`);
            const cocs = await this.getCocs(categoryCombo);

            const allCocIds = cocs.map(coc => coc.id);
            const cocIdsChunks = _.chunk(allCocIds, 1000);

            this.debug(`Deleting ${cocs.length} COCS for category combo ${categoryCombo.code}`);
            for (const [index, cocIds] of cocIdsChunks.entries()) {
                console.debug(`[${index + 1}/${cocIdsChunks.length}] ${cocIds.length} to delete`);

                await runPsql(this.psqlOptions, async query => {
                    await query(`CREATE TEMP TABLE temp_uids (uid VARCHAR(11))`);
                    await query(`INSERT INTO temp_uids (uid) SELECT * FROM unnest($1::text[])`, [
                        cocIds,
                    ]);
                    await query(this.getSql("delete-cocs.sql"));
                });
            }

            await this.deleteCategoryCombo(categoryCombo);
        }
    }

    private async getCocs(
        categoryCombo: SelectedPick<D2CategoryComboSchema, { id: true; code: true }>
    ): Promise<Ref[]> {
        const res = await this.api.metadata
            .get({
                categoryOptionCombos: {
                    fields: { id: true },
                    filter: { "categoryCombo.id": { eq: categoryCombo.id } },
                },
            })
            .getData();

        return res.categoryOptionCombos;
    }

    private async deleteCategoryCombo(
        categoryCombo: SelectedPick<D2CategoryComboSchema, { id: true; code: true }>
    ) {
        try {
            console.debug(`Deleting category combo ${categoryCombo.code}`);
            const res = await this.api.metadata
                .post(
                    { categoryCombos: [{ id: categoryCombo.id }] },
                    {
                        importStrategy: "DELETE",
                        importMode: this.dryRun ? "VALIDATE" : "COMMIT",
                    }
                )
                .getData();

            this.debug(`Deleted category combo ${categoryCombo.code} (${res.status})`);
        } catch (error) {
            this.debug(
                `Error deleting category combo ${categoryCombo.code}: ${JSON.stringify(
                    error,
                    null,
                    4
                )}`
            );
        }
    }

    private async getDeprecatedCategoryCombos() {
        const { categoryCombos } = await this.api.metadata
            .get({
                categoryCombos: {
                    fields: {
                        id: true,
                        code: true,
                    },
                    filter: { identifiable: { in: this.deprecatedCategoryCombos } },
                },
            })
            .getData();

        const categoryCombos2 = _(categoryCombos)
            .sortBy(cc => cc.code.length)
            .value();
        return categoryCombos2;
    }

    private async deleteDataElements(): Promise<void> {
        const dataElements = await this.getDeprecatedDataElements();
        await this.deleteDataValuesForDeprecatedDataElements(dataElements);

        for (const dataElement of dataElements) {
            this.debug(`Deleting data element ${dataElement.code}`);
            const res = await this.api.metadata
                .post(
                    { dataElements: [{ id: dataElement.id }] },
                    { importStrategy: "DELETE", importMode: this.dryRun ? "VALIDATE" : "COMMIT" }
                )
                .getData();

            this.debug(`Deleted data element ${dataElement.code} (${res.status})`);
        }
    }

    private async getDeprecatedDataElements(): Promise<Array<{ id: string; code: string }>> {
        const metadata = await this.api.metadata
            .get({
                dataElements: {
                    fields: { id: true, code: true },
                    filter: { code: { in: this.getDeprecatedDataElementCodes() } },
                },
            })
            .getData();

        return metadata.dataElements;
    }

    private async deleteDepecratedIndicators(): Promise<void> {
        const { indicators } = await this.api.metadata
            .get({
                indicators: {
                    fields: { id: true, code: true },
                    filter: { code: { in: this.getDeprecatedIndicatorCodes() } },
                },
            })
            .getData();

        for (const indicator of indicators) {
            this.debug(`Deleting indicator ${indicator.code}`);
            const res = await this.api.metadata
                .post(
                    { indicators: [{ id: indicator.id }] },
                    { importStrategy: "DELETE", importMode: this.dryRun ? "VALIDATE" : "COMMIT" }
                )
                .getData();

            this.debug(`Deleted indicator ${indicator.code} (${res.status})`);
        }
    }

    debug(message: string) {
        const prefix = this.dryRun ? "[DRY RUN] " : "";
        console.debug(`${prefix}${message}`);
    }
}
