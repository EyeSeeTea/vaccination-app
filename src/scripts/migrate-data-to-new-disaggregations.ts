import _ from "lodash";
import { array, command, multioption, run, string } from "cmd-ts";
import { getD2Api, getSourceTargetD2Args } from "./utils";
import { D2Api } from "../types/d2-api";
import { promiseMap } from "../utils/promises";
import { assert, assertCondition, assertValue } from "../utils/assert";
import {
    dataElementsInfo,
    DisaggregationType,
    getDataElementFromDisaggregation,
} from "../models/D2CampaignMetadata";
import { fromPairs } from "../utils/lodash-mixins";
import { Ref } from "../models/db.types";

const program = command({
    name: "create-disaggregated-metadata",
    args: {
        ...getSourceTargetD2Args(),
        orgUnitIds: multioption({
            type: array(string),
            long: "orgunit-ids",
            description: "Organisation Unit IDs to migrate (all children will be included)",
        }),
    },
    handler: async args => {
        const apiSource = getD2Api({ auth: args.sourceAuth, baseUrl: args.sourceUrl });
        const apiTarget = getD2Api({ auth: args.targetAuth, baseUrl: args.targetUrl });
        new MigrateData(apiSource, apiTarget).execute(args.orgUnitIds);
    },
});

run(program, process.argv.slice(2));

class MigrateData {
    dataElementsCampaign = {
        RVC_AEFI: "OY40ChLj0YE",
        RVC_SAFETY_BOXES: "CCqBBZmfsTs",
        RVC_SYRINGES: "WCQHqR2RBIX",
        RVC_NEEDLES: "OQOgTET6NwY",
        RVC_AEB: "q0MMyiUi0Pl",
        RVC_DOSES_USED: "ycy4WvaTCtm",
        RVC_ADS_USED: "ywKG3QmCbDi",
        RVC_DOSES_ADMINISTERED: "mkgnDxyksQS",
    };

    dataElementsPopulation = {
        RVC_AGE_DISTRIBUTION: "e0cPRcP5XNc",
        RVC_TOTAL_POPULATION: "mOE5w8jVtuh",
        RVC_POPULATION_BY_AGE: "mcug85FSmAk",
    };

    categoryComboCodes = [
        "RVC_AGE_GROUP",
        "RVC_AGE_GROUP_DISTATUS",
        "RVC_AGE_GROUP_DISTATUS_WS",
        "RVC_AGE_GROUP_GENDER",
        "RVC_AGE_GROUP_GENDER_DISTATUS",
        "RVC_AGE_GROUP_GENDER_DISTATUS_WS",
        "RVC_AGE_GROUP_GENDER_WS",
        "RVC_AGE_GROUP_WS",
    ];

    constructor(private apiSource: D2Api, private apiTarget: D2Api) {}

    async execute(orgUnitIds: string[]): Promise<void> {
        await this.migrateCampaignsData(orgUnitIds);
    }

    async migrateCampaignsData(orgUnitIds: string[]): Promise<void> {
        console.debug(`Get campaign data values from source: orgUnitIds=${orgUnitIds.join(", ")}`);
        /* Example data value returned by DHIS2:
         {
            "dataElementName": "Vaccine doses administered",
            "categoryOptionCombo": "Kwyo5Eygxts",
            "categoryOptionComboName": "Malaria, Dose 1, Preventive, 5 - 11 m",
            "value": "1"
         }
        */

        const { dataValues } = await this.apiSource.dataValues
            .getSet({
                dataSet: [],
                // prop dataElement: Id[] not implemented by this version of d2-api
                ["dataElement" as string]: _.values(this.dataElementsCampaign),
                startDate: (new Date().getFullYear() - 50).toString(),
                endDate: (new Date().getFullYear() + 50).toString(),
                orgUnit: orgUnitIds,
                children: true,
            })
            .getData();

        const { dataElements } = await this.apiTarget.metadata
            .get({
                dataElements: {
                    fields: {
                        id: true,
                        code: true,
                    },
                    filter: {
                        code: { $like: "RVC_" },
                    },
                },
            })
            .getData();

        console.debug(`Retrieved ${dataValues.length} data values`);

        const cocIds = _(dataValues)
            .map(dv => dv.categoryOptionCombo)
            .uniq()
            .value();

        const cocsMap = await this.getCocsMap(cocIds);
        /*
        {
            ...
            "CMCKjrQbsLR": [
                {"id": "yW8ynz2g8v3", "category": {"code": "RVC_ANTIGEN"}},
                {"id": "J9fs9THA8Wr", "category": {"code": "RVC_GENDER"}},
                {"id": "mKkzuzv5Ier", "category": {"code": "RVC_AGE_GROUP"}},
                {"id": "WvIXuDUzaPa", "category": {"code": "RVC_DOSE"}},
                {"id": "Iojd8Ab3uHa", "category": {"code": "RVC_TYPE"}}
            ]
        }

        For each data element, get the dataElement for disaggregation and get the new COC
        */

        const categoriesMap: Record<string, DisaggregationType> = {
            RVC_ANTIGEN: "antigen",
            RVC_DOSE: "dose",
            RVC_TYPE: "campaignType",
        };

        const cocsMapping = await this.getCategoryCombosMapping();

        const dataValues2 = dataValues.map((dv): typeof dv => {
            const dataElementCode = _(this.dataElementsCampaign)
                .toPairs()
                .map(([deCode, deId]) => (deId === dv.dataElement ? deCode : null))
                .compact()
                .first();

            assertValue(dataElementCode, `Unknown data element id: ${dv.dataElement}`);

            const dataElementInfo = dataElementsInfo.find(de => de.modelCode === dataElementCode);
            if (!dataElementInfo) return dv;

            const disaggregations = dataElementInfo.disaggregations;
            const cocInfo = assert(cocsMap[dv.categoryOptionCombo]);

            console.debug(
                dataElementCode,
                "->",
                dataElementInfo.code,
                disaggregations,
                JSON.stringify(cocInfo)
            );

            const dataElementDisaggregation = fromPairs(
                _(cocInfo.categoryOptions)
                    .map((categoryOption): [DisaggregationType, string] | null => {
                        const disaggregationType = categoriesMap[categoryOption.category.code];
                        return disaggregationType
                            ? [disaggregationType, categoryOption.code || categoryOption.name]
                            : null;
                    })
                    .compact()
                    .value()
            );

            const categoryOptionsToKeep = _(cocInfo.categoryOptions)
                .reject(categoryOption => Boolean(categoriesMap[categoryOption.category.code]))
                .value();

            const dataElement2 = getDataElementFromDisaggregation(
                dataElementInfo,
                dataElementDisaggregation,
                dataElements
            );

            // from categoryOptionsToKeep
            const cocId = cocsMapping.getForCategoryOptions(categoryOptionsToKeep);

            // Change dataElement to the disaggregated one and COC to only the remaining category options
            return {
                ...dv,
                dataElement: dataElement2.id,
                categoryOptionCombo: cocId,
            };
        });

        console.debug(`Post ${dataValues2.length} migrated data values to target DHIS2`);
        // TODO: post
    }

    private async getCategoryCombosMapping(): Promise<CocsMapping> {
        const { categoryCombos } = await this.apiTarget.metadata
            .get({
                categoryCombos: {
                    fields: {
                        id: true,
                        code: true,
                        categoryOptionCombos: {
                            id: true,
                            categoryOptions: { id: true },
                        },
                    },
                    filter: { code: { in: this.categoryComboCodes } },
                },
            })
            .getData();

        return CocsMapping.fromCategoryCombos(categoryCombos);
    }

    private async getCocsMap(cocIds: CocId[]): Promise<CocMapping> {
        console.debug(`Build COC map for ${cocIds.length} COCs`);
        const res = await promiseMap(_.chunk(cocIds, 300), async chunkCocIds => {
            console.debug(`Get COCs chunk with ${chunkCocIds.length} COCs`);
            const { categoryOptionCombos } = await this.apiSource.metadata
                .get({
                    categoryOptionCombos: {
                        fields: {
                            id: true,
                            name: true,
                            categoryOptions: {
                                id: true,
                                name: true,
                                code: true,
                                categories: { code: true },
                            },
                        },
                        filter: { id: { in: chunkCocIds } },
                    },
                })
                .getData();

            return categoryOptionCombos;
        });

        return _(res)
            .flatten()
            .map((coc): [CocId, { categoryOptions: CategoryOption[] }] => {
                if (coc.name === "default") return [coc.id, { categoryOptions: [] }];

                const categoryOptions = coc.categoryOptions.map(categoryOption => {
                    const categories = categoryOption.categories.filter(category =>
                        category.code?.startsWith("RVC_")
                    );
                    assertCondition(
                        categories.length === 1,
                        `Expected only one category per category option: ${categoryOption.id}`
                    );
                    const category = assert(_.first(categories));
                    return { ...categoryOption, category: category };
                });
                return [coc.id, { categoryOptions }];
            })
            .fromPairs()
            .value();
    }

    async migratePopulation(orgUnitIds: string[]): Promise<void> {
        console.debug(`Get data values from source DHIS2 for orgUnits: ${orgUnitIds.join(", ")}`);
        /* 
            {
                "dataElementName": "Population by age",
                "period": "20251211",
                "value": "10.00",
                "categoryOptionComboName": "Malaria, Dose 1, 5 - 11 m"
            }
        */

        const { dataValues } = await this.apiSource.dataValues
            .getSet({
                dataSet: [],
                dataElementGroup: ["mqamM2sRSrR"], // dataElementGroup "RVC - Population"
                startDate: (new Date().getFullYear() - 50).toString(),
                endDate: (new Date().getFullYear() + 50).toString(),
                orgUnit: orgUnitIds,
                children: true,
            })
            .getData();

        console.debug(`Retrieved ${dataValues.length} data values`);
    }
}

type CocMapping = Record<CocId, { categoryOptions: CategoryOption[] }>;

type CocId = string;

type CategoryOption = {
    id: string;
    name: string;
    code: string;
    category: { code: string };
};

type CategoryOptionsId = string;
type CocsMapping_ = Map<CategoryOptionsId, CocId>;

type CategoryCombo = {
    categoryOptionCombos: Array<{
        id: string;
        categoryOptions: Array<{ id: string }>;
    }>;
};

class CocsMapping {
    private constructor(private cocsMapping: CocsMapping_) {}

    static fromCategoryCombos(categoryCombos: CategoryCombo[]): CocsMapping {
        const pairs = categoryCombos.flatMap(categoryCombo => {
            return categoryCombo.categoryOptionCombos.map((coc): [CategoryOptionsId, CocId] => {
                const categoryOptionsId = _(coc.categoryOptions)
                    .map(co => co.id)
                    .sort()
                    .join(".");
                return [categoryOptionsId, coc.id];
            });
        });

        return new CocsMapping(new Map(pairs));
    }

    getForCategoryOptions(categoryOptions: Ref[]): CocId {
        const key = _(categoryOptions)
            .map(co => co.id)
            .sort()
            .join(".");
        return assert(
            this.cocsMapping.get(key),
            `COC not found for category options: ${categoryOptions}`
        );
    }
}
