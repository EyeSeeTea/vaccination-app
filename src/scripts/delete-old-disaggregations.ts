/**
 * Delete deprecated metadata and their dependencies. Entities to delete:
 *
 * - Category combos which are disaggregated by antigen/doses/campaignType, for example
 *   "RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP", which will now be a dataElement antigen/dose/type.
 *   Also, delete their categoryOptionCombo, associated datavalues and audits.
 *
 * - Non-disaggregated data elements (+dataValues/audits). Example: "RVC_DOSES_ADMINISTERED"
 *
 * - Indicators associated to now deprecated global data elements.
 **/

import _ from "lodash";
import { command, flag, option, run } from "cmd-ts";
import fs from "fs";
import path from "path";

import { runPsql } from "./psql";
import { D2Api, D2CategoryComboSchema, Ref, SelectedPick } from "../types/d2-api";
import { getAppApi, getDefaultD2Args, getLogsArguments, setupLogsFromArgs } from "./utils";
import { baseCategoriesForDosesAdministered } from "../models/config";

const program = command({
    name: "delete-old-disaggregations",
    args: {
        ...getDefaultD2Args(),
        postgresUrl: option({
            long: "postgres-url",
            description: "Postgres URL. Ex: postgresql://USER:PASSWORD@localhost:5432/DB",
        }),
        delete: flag({
            long: "delete",
            description: "Actually perform a delete (by default, the script runs in dry-run mode)",
        }),
        ...getLogsArguments(),
    },
    handler: async args => {
        setupLogsFromArgs(args);
        const appApi = await getAppApi({ auth: args.auth, url: args.url });
        await new DeleteOldDisaggregations(appApi.d2Api, args.postgresUrl, args).execute();
    },
});

run(program, process.argv.slice(2));

class DeleteOldDisaggregations {
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

    deprecatedDataElements = [
        "RVC_DOSES_ADMINISTERED",
        "RVC_DOSES_USED",
        "RVC_AEFI",
        "RVC_NEEDLES",
        "RVC_SYRINGES",
        "RVC_POPULATION_BY_AGE",
    ];

    deprecatedIndicators = [
        "RVC_DOSES_ADMINISTERED",
        "RVC_CAMPAIGN_COVERAGE",
        "RVC_VACCINE_UTILIZATION",
        "RVC_DILUTION_SYRINGES_RATIO",
        "RVC_CAMPAIGN_NEEDLES_RATIO",
    ];

    constructor(
        private api: D2Api,
        private psqlUrl: string,
        private options: { delete: boolean }
    ) {}

    async execute(): Promise<void> {
        await this.createSqlIndexesToSpeedupDeletions();
        await this.removeBaseCategoriesInDosesAdministeredCategoryCombos();
        await this.deleteDataValuesForDeprecatedDataElements();
        await this.deleteDeprecatedIndicators();
        await this.deleteDeprecatedDataElements();
        await this.deleteDeprecatedCategoryCombos();
    }

    private get dryRun(): boolean {
        return !this.options.delete;
    }

    private async removeBaseCategoriesInDosesAdministeredCategoryCombos(): Promise<void> {
        this.debug(`Reducing categories in category combos`);

        // Vacc app uses category combos to model the categories that are optional/required for
        // each data element (optionally customizable by antigen). By doing it like this,
        // however, we create COCs that are not actually used. To reduce the number of COCs, we will
        // remove from the category combo -only for Doses Administered- the categories that are
        // always present.

        const { categoryCombos } = await this.api.metadata
            .get({
                categoryCombos: {
                    fields: {
                        $owner: true,
                        categoryOptionCombos: { id: true },
                        categories: { id: true, code: true },
                    },
                    filter: { code: { $like: "RVC_DE_DOSES_ADMINISTERED_" } },
                },
            })
            .getData();

        const categoryOptionCombos = _(categoryCombos)
            .flatMap(cc => cc.categoryOptionCombos)
            .value();

        if (categoryOptionCombos.length > 0) {
            // As COCs are not used anywhere, we can simply remove them at this point. DHIS2 may
            // eventually recreate them, but we will have a smaller number of COCs as we cleared
            // the categories.
            this.debug(`Delete ${categoryOptionCombos.length} COCs`);
            await this.deleteCocs(categoryOptionCombos, { prefix: "DOSES_ADMIN CATCOMBOS" });
        }

        const categoryCombosWithReducedCategories = _(categoryCombos)
            .map(categoryCombo => {
                // d2-api does not correctly type the result from intersection of fields
                // `"$owner: true & categories: { id: true, code: true }"`,
                // so let's type assert so we can access `categoryCombo.categories[].code`
                const categoriesForCategoryCombo: Array<{ id: string; code: string }> =
                    categoryCombo.categories;

                // Remove the categories already added as base categories in the code
                const categories = _(categoriesForCategoryCombo)
                    .reject(category => baseCategoriesForDosesAdministered.includes(category.code))
                    .value();

                return !_.isEqual(categoryCombo.categories, categories)
                    ? { ...categoryCombo, categories: categories, categoryOptionCombos: [] }
                    : null;
            })
            .compact()
            .value();

        if (categoryCombosWithReducedCategories.length > 0) {
            const codes = categoryCombosWithReducedCategories.map(cc => cc.code).join(", ");
            this.debug(`Update category combos to reduce number of categories: ${codes}`);
            const res = await this.api.metadata
                .post({ categoryCombos: categoryCombosWithReducedCategories })
                .getData();
            this.debug(`Updated category combos: ${res.status}`);
        }
    }

    private async createSqlIndexesToSpeedupDeletions(): Promise<void> {
        this.debug(`Insert indexes to speed up deletions`);

        await runPsql({ url: this.psqlUrl, dryRun: false }, async query => {
            const sql = this.getSqlAsString("indexes.sql");
            await query(sql);
        });
    }

    private get psqlOptions() {
        return { url: this.psqlUrl, dryRun: this.dryRun };
    }

    private async deleteDataValuesForDeprecatedDataElements(): Promise<void> {
        const dataElements = await this.getDeprecatedDataElements();
        const dataElementCodes = dataElements.map(de => de.code);
        this.debug(
            `Found ${dataElements.length} deprecated data elements: ${
                dataElementCodes.join(", ") || "-"
            }`
        );

        this.debug(`Deleting data values`);

        const resValues = await runPsql(this.psqlOptions, async query => {
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
        this.debug(`Deleted data values: ${resValues?.rowCount}`);

        this.debug(`Deleting data values audits`);
        const resAudits = await runPsql(this.psqlOptions, async query => {
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
        this.debug(`Deleted data values audits: ${resAudits?.rowCount}`);
    }

    private getSqlAsString(filename: string): string {
        const sqlPath = path.join(__dirname, "sql", filename);
        return fs.readFileSync(sqlPath, "utf-8");
    }

    private async deleteDeprecatedCategoryCombos(): Promise<void> {
        const categoryCombos = await this.getDeprecatedCategoryCombos();
        const codes = categoryCombos.map(cc => cc.code).join(", ");
        this.debug(`Found ${categoryCombos.length} deprecated category combos: ${codes || "-"}`);

        for (const categoryCombo of categoryCombos) {
            this.debug(`Processing category combo ${categoryCombo.code}`);
            const cocs = await this.getCategoryOptionCombos(categoryCombo);
            this.debug(`Deleting ${cocs.length} COCS for category combo ${categoryCombo.code}`);
            await this.deleteCocs(cocs, { prefix: `CATCOMBO ${categoryCombo.code}` });
            await this.deleteCategoryCombo(categoryCombo);
        }
    }

    private async deleteCocs(cocs: Ref[], options: { prefix: string }): Promise<void> {
        const cocIdsChunks = _(cocs)
            .map(coc => coc.id)
            .chunk(1000)
            .value();

        for (const [index, ids] of cocIdsChunks.entries()) {
            const pagination = `[${index + 1}/${cocIdsChunks.length}]`;
            this.debug(`Delete COCs: [${options.prefix}] ${pagination} ${ids.length} to delete`);

            await runPsql(this.psqlOptions, async query => {
                await query(`CREATE TEMP TABLE temp_uids (uid VARCHAR(11))`);
                await query(`INSERT INTO temp_uids (uid) SELECT * FROM unnest($1::text[])`, [ids]);
                await query(this.getSqlAsString("delete-cocs.sql"));
            });
        }
    }

    private async getCategoryOptionCombos(
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
            this.debug(`Deleting category combo ${categoryCombo.code}`);
            const res = await this.api.metadata
                .post(
                    { categoryCombos: [{ id: categoryCombo.id }] },
                    { importStrategy: "DELETE", importMode: this.getImportMode() }
                )
                .getData();

            this.debug(`Deleted category combo ${categoryCombo.code} (${res.status})`);
        } catch (error) {
            const errStr = JSON.stringify(error, null, 4);
            this.debug(`Error deleting category combo ${categoryCombo.code}: ${errStr}`);
        }
    }

    private getImportMode() {
        return this.dryRun ? "VALIDATE" : "COMMIT";
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

        // Sort by code length to delete smaller category combos first (less categories, less COCs)
        return _(categoryCombos)
            .sortBy(categoryCombo => categoryCombo.code.length)
            .value();
    }

    private async deleteDeprecatedDataElements(): Promise<void> {
        for (const dataElement of await this.getDeprecatedDataElements()) {
            this.debug(`Deleting data element ${dataElement.code}`);
            const res = await this.api.metadata
                .post(
                    { dataElements: [{ id: dataElement.id }] },
                    { importStrategy: "DELETE", importMode: this.getImportMode() }
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
                    filter: { identifiable: { in: this.deprecatedDataElements } },
                },
            })
            .getData();

        return metadata.dataElements;
    }

    private async deleteDeprecatedIndicators(): Promise<void> {
        const { indicators } = await this.api.metadata
            .get({
                indicators: {
                    fields: { id: true, code: true },
                    filter: { identifiable: { in: this.deprecatedIndicators } },
                },
            })
            .getData();

        const codes = indicators.map(ind => ind.code).join(", ");
        this.debug(`Found ${indicators.length} deprecated indicators: ${codes || "-"}`);

        for (const indicator of indicators) {
            this.debug(`Deleting indicator ${indicator.code}`);
            const res = await this.api.metadata
                .post(
                    { indicators: [{ id: indicator.id }] },
                    { importStrategy: "DELETE", importMode: this.getImportMode() }
                )
                .getData();

            this.debug(`Deleted indicator ${indicator.code} (${res.status})`);
        }
    }

    private debug(message: string) {
        const prefix = this.dryRun ? "[DRY RUN] " : "";
        console.debug(`${prefix}${message}`);
    }
}
