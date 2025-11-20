import _ from "lodash";
import {
    D2Api,
    D2CategoryCombo,
    D2DataElement,
    D2Indicator,
    D2ValidationRule,
    MetadataPick,
    PartialPersistedModel,
} from "@eyeseetea/d2-api/2.36";
import { CampaignType } from "../models/AntigensDisaggregationLegacy";
import {
    dataElementsByAntigen,
    indicatorsByAntigen,
    NewDataElement,
} from "../models/D2CampaignMetadata";
import { cartesianProduct2, powerSet } from "../utils/lodash-mixins";
import { interpolate } from "../utils/strings";
import { getUid } from "../utils/dhis2";
import { assert } from "../utils/assert";

export class CreateDisaggregatedD2Metadata {
    campaignTypes = {
        preventive: { name: "Preventive", code: "PREVENTIVE" },
        reactive: { name: "Reactive", code: "REACTIVE" },
    };

    categoryCombos = [
        {
            categories: [
                { name: "Age Group", code: "RVC_AGE_GROUP", required: true },
                { name: "Gender", code: "RVC_GENDER", required: false },
                { name: "Displacement Status", code: "RVC_DISTATUS", required: false },
                { name: "Woman Status", code: "RVC_WS", required: false },
            ],
        },
        {
            categories: [{ name: "Severity", code: "RVC_SEVERITY", required: true }],
        },
    ];

    constructor(private api: D2Api) {}

    async execute() {
        console.debug("Creating disaggregated metadata...");

        const metadata = await this.getMetadata();

        const antigensWithCampaignTypeSelectable = assert(
            metadata.categoryOptionGroups.find(cog => cog.code === "RVC_ANTIGEN_TYPE_SELECTABLE")
        ).categoryOptions;

        const antigenCogs = metadata.categoryOptionGroups.filter(cog =>
            cog.code.endsWith("_DOSES")
        );

        const antigens = antigenCogs.map(cog => {
            const antigenName = assert(cog.name.split(" - ")[0]);
            const antigenCode = assert(cog.code.match(/RVC_ANTIGEN_(.+)_DOSES/)?.[1]);
            const doses = _.range(1, cog.categoryOptions.length + 1);
            const isCampaignTypeSelectable = antigensWithCampaignTypeSelectable.some(
                antigen => antigen.code === `RVC_ANTIGEN_${antigenCode}`
            );

            return {
                antigen: { name: antigenName, code: antigenCode },
                disaggregations: {
                    dose: doses,
                    campaignType: isCampaignTypeSelectable
                        ? (["preventive", "reactive"] as CampaignType[])
                        : (["preventive"] as CampaignType[]),
                },
            };
        });

        const dataElements = dataElementsByAntigen.flatMap(dataElementConfig => {
            return antigens.flatMap(antigen => {
                return this.getDataElements(metadata, dataElementConfig, antigen, null, null);
            });
        });

        const indicators = indicatorsByAntigen.flatMap(indicatorConfig => {
            const existingIndicator =
                indicatorConfig.modelCode && !indicatorConfig.newEntity
                    ? assert(
                          metadata.indicators.find(
                              indicator => indicator.code === indicatorConfig.modelCode
                          ),
                          `Indicator not found: ${indicatorConfig.modelCode}`
                      )
                    : undefined;

            const antigens2 = indicatorConfig.extraDisaggregations.includes("antigen")
                ? antigens
                : [null];

            const error = () => {
                throw new Error();
            };

            return antigens2.flatMap(antigen => {
                const combos = cartesianProduct2([
                    indicatorConfig.extraDisaggregations.includes("dose")
                        ? antigen
                            ? antigen.disaggregations.dose
                            : error()
                        : [null],
                    indicatorConfig.extraDisaggregations.includes("campaignType")
                        ? antigen
                            ? antigen.disaggregations.campaignType
                            : error()
                        : [null],
                ]);

                return combos.map(([doseNum, campaignType]): PartialPersistedModel<D2Indicator> => {
                    const name = _.compact([
                        indicatorConfig.name,
                        antigen?.antigen.name,
                        doseNum ? `Dose ${doseNum.toString()}` : null,
                        campaignType ? this.campaignTypes[campaignType].name : null,
                    ]).join(" - ");

                    // Keep only the dose number (if present) in the form name
                    const formName = _.compact([
                        indicatorConfig.name,
                        doseNum ? `Dose ${doseNum.toString()}` : null,
                    ]).join(" - ");

                    const code = _.compact([
                        indicatorConfig.code,
                        antigen?.antigen.code,
                        doseNum,
                        campaignType ? this.campaignTypes[campaignType].code : null,
                    ]).join("-");

                    const shortName = name
                        .split(" - ")
                        .map(n => acronym(n))
                        .join(" ");

                    const existingDataElements = metadata.dataElements.map(
                        (de): [string, string] => [de.code, `#{${de.id}}`]
                    );

                    const namespace = _(dataElementsByAntigen)
                        .map((dataElementConfig): [string, string] => {
                            const dataElements = antigen
                                ? this.getDataElements(
                                      metadata,
                                      dataElementConfig,
                                      antigen,
                                      doseNum,
                                      campaignType
                                  )
                                : antigens.flatMap(antigen =>
                                      this.getDataElements(
                                          metadata,
                                          dataElementConfig,
                                          antigen,
                                          doseNum,
                                          campaignType
                                      )
                                  );
                            const formula =
                                "(" + dataElements.map(de => `#{${de.id}}`).join(" + ") + ")";
                            return [dataElementConfig.code, formula];
                        })
                        .thru(pairs => [...existingDataElements, ...pairs])
                        .fromPairs()
                        .value();

                    const existingIndicator2 = metadata.indicators.find(
                        indicator => indicator.code === code
                    );
                    return {
                        indicatorType: { id: "cpUX4dfC0mL" },
                        ...existingIndicator,
                        id: getUid("indicator", code.replace(/-/g, "_")),
                        ...existingIndicator2,
                        name: name,
                        shortName: shortName,
                        numerator: interpolate(indicatorConfig.numerator, namespace),
                        denominator: interpolate(indicatorConfig.denominator, namespace),
                        code: code,
                        formName: formName,
                    };
                });
            });
        });

        dataElements.forEach(de => {
            console.debug(`DataElement: ${de.name} (${de.code}) - ${de.formName}`);
        });
        console.debug(`Creating ${dataElements.length} data elements...`);

        indicators.forEach(ind => {
            console.debug(`Indicator: ${ind.name} (${ind.code}) - ${ind.formName}`);
        });
        console.debug(`Creating ${indicators.length} indicators...`);

        const categoryCombos = this.createCategoriesCombos(metadata);
        categoryCombos.forEach(cc => {
            console.debug(
                `CategoryCombo: ${cc.name} [${cc.code}] (${cc.categories?.length} categories)`
            );
        });

        console.debug(`Creating ${categoryCombos.length} category combos...`);

        const validationRules = this.getValidationRules(metadata, antigens, dataElements);
        console.debug(`Creating ${validationRules.length} validation rules...`);

        const payload = _({ dataElements, indicators, categoryCombos, validationRules })
            .mapValues(objs => objs.map(obj => _.omit(obj, ["lastUpdated"])))
            .value();

        const res = await this.api.metadata
            .post(payload)
            .getData()
            .catch(err => {
                console.error("Error saving metadata:", JSON.stringify(err.response.data, null, 4));
                throw err;
            });

        console.debug("Updating category option combos...");
        for (const cc of categoryCombos) {
            const cocsCount = _(cc.categories)
                .map(
                    category =>
                        metadata.categories.find(category_ => category_.id === category.id)
                            ?.categoryOptions.length || 1
                )
                .reduce((a, b) => a * b, 1);
            console.debug(`Generating COCs for CategoryCombo ${cc.code} (${cocsCount})`);

            await this.api.maintenance.categoryOptionComboSingleUpdate(cc.id).getData();
        }

        return res;
    }

    private getDataElements(
        metadata: Metadata,
        dataElementConfig: NewDataElement,
        antigen: AntigenInfo,
        doseNum: number | null,
        campaignType: CampaignType | null
    ) {
        const combos = cartesianProduct2([
            dataElementConfig.extraDisaggregations.includes("dose")
                ? doseNum
                    ? [doseNum]
                    : antigen.disaggregations.dose
                : [null],
            dataElementConfig.extraDisaggregations.includes("campaignType")
                ? campaignType
                    ? [campaignType]
                    : antigen.disaggregations.campaignType
                : [null],
        ]);

        return combos.map(([doseNum, campaignType]): PartialPersistedModel<D2DataElement> => {
            const existingDataElement = !dataElementConfig.newEntity
                ? assert(
                      metadata.dataElements.find(de => de.code === dataElementConfig.modelCode),
                      `DataElement not found: ${dataElementConfig.modelCode}`
                  )
                : undefined;

            const name = _.compact([
                dataElementConfig.name,
                antigen.antigen.name,
                doseNum ? `Dose ${doseNum.toString()}` : null,
                campaignType ? this.campaignTypes[campaignType].name : null,
            ]).join(" - ");

            // Keep only the dose number (if present) in the form name
            const formName = _.compact([
                dataElementConfig.name,
                doseNum ? `Dose ${doseNum.toString()}` : null,
            ]).join(" - ");

            const code = _.compact([
                dataElementConfig.code,
                antigen.antigen.code,
                doseNum,
                campaignType ? this.campaignTypes[campaignType].code : null,
            ]).join("-");

            const shortName = name
                .split(" - ")
                .map(n => acronym(n))
                .join(" ");

            return {
                ...existingDataElement,
                id: getUid("dataElement", code.replace(/-/g, "_")),
                name: name,
                shortName: shortName,
                formName: formName,
                code: code,
                categoryCombo: assert(
                    metadata.categoryCombos.find(
                        cc =>
                            (dataElementConfig.categoryCombo.code &&
                                cc.code === dataElementConfig.categoryCombo.code) ||
                            (dataElementConfig.categoryCombo.name &&
                                cc.name === dataElementConfig.categoryCombo.name)
                    ),
                    `CategoryCombo not found: ${dataElementConfig.categoryCombo.code}`
                ),
            };
        });
    }

    private getValidationRules(
        metadata: Metadata,
        antigensInfo: AntigenInfo[],
        dataElements: PartialPersistedModel<D2DataElement>[]
    ): PartialPersistedModel<D2ValidationRule>[] {
        const rulesByCode = _.keyBy(metadata.validationRules, vr => vr.code);
        const severityCocIds = ["yqYy13e5JVL", "xOaegkYE7jY"];

        const rules1 = antigensInfo.flatMap(antigenInfo => {
            return antigenInfo.disaggregations.campaignType.flatMap(
                (campaignType): PartialPersistedModel<D2ValidationRule> => {
                    const { antigen } = antigenInfo;

                    const code = [
                        "RVC_AEFI_RVC_ANTIGEN",
                        antigen.code,
                        campaignType.toUpperCase(),
                    ].join("-");

                    const id =
                        rulesByCode[code]?.id ||
                        getUid(
                            "validationRule-aefi",
                            antigen.code.replace(/-/g, "_") + campaignType
                        );
                    const dataElementCode = [
                        "RVC_AEFI",
                        antigen.code,
                        campaignType.toUpperCase(),
                    ].join("-");

                    const aefiDataElement = assert(
                        dataElements.find(de => de.code === dataElementCode),
                        `DataElement not found: ${dataElementCode}`
                    );

                    // AEFI-[ANTIGEN]-[TYPE]:Minor + AEFI-[ANTIGEN]-[TYPE]:Severe
                    const leftSideExpression = severityCocIds
                        .map(cocId => `#{${aefiDataElement.id}.${cocId}}`)
                        .join(" + ");

                    const details = [antigen.name, this.campaignTypes[campaignType].name].join(
                        " - "
                    );

                    return {
                        id: id,
                        code: code,
                        name: `No Adverse Event Following Immunization (${details})`,
                        sharing: { public: "rw------" },
                        created: "2023-03-01T10:25:48.600",
                        instruction: `Please fill in the AEFI registration form / Por favor, rellene el formulario de registro AEFI / SVP, remplissez le formulaire AEFI (${details})`,
                        importance: "MEDIUM",
                        operator: "equal_to",
                        periodType: "Daily",
                        leftSide: {
                            expression: leftSideExpression,
                            description: `Adverse Event Following Immunization (${details})`,
                            slidingWindow: false,
                            missingValueStrategy: "NEVER_SKIP",
                        },
                        rightSide: {
                            expression: "0",
                            description: "Zero",
                            slidingWindow: false,
                            missingValueStrategy: "NEVER_SKIP",
                        },
                        skipFormValidation: false,
                        organisationUnitLevels: [],
                    };
                }
            );
        });

        const rules2 = antigensInfo.flatMap(antigenInfo => {
            const { antigen, disaggregations } = antigenInfo;

            return disaggregations.campaignType.flatMap(
                (campaignType): PartialPersistedModel<D2ValidationRule> => {
                    const administeredDataElements = disaggregations.dose.map(doseNum => {
                        const code = [
                            "RVC_DA",
                            antigen.code,
                            doseNum.toString(),
                            campaignType.toUpperCase(),
                        ].join("-");

                        return assert(
                            dataElements.find(de => de.code === code),
                            `DataElement not found: ${code}`
                        );
                    });

                    const usedCode = ["RVC_DU", antigen.code, campaignType.toUpperCase()].join("-");

                    const usedDataElement = assert(
                        dataElements.find(de => de.code === usedCode),
                        `DataElement not found: ${usedCode}`
                    );

                    const leftSideExpression = administeredDataElements
                        .map(de => `#{${de.id}}`)
                        .join(" + ");

                    const details = [antigen.name, this.campaignTypes[campaignType].name].join(
                        " - "
                    );

                    const code = ["RVC_DOSES", antigen.code, campaignType.toUpperCase()].join("-");

                    const id =
                        rulesByCode[code]?.id ||
                        getUid(
                            "validationRule-doses",
                            antigen.code.replace(/-/g, "_") + campaignType
                        );

                    return {
                        id: id,
                        code: code,
                        name: `Vaccine doses administered <= used (${details})`,
                        created: "2023-03-01T10:25:48.597",
                        importance: "MEDIUM",
                        operator: "less_than_or_equal_to",
                        periodType: "Daily",
                        leftSide: {
                            expression: leftSideExpression,
                            description: `Vaccine doses administered (${details})`,
                            slidingWindow: false,
                            missingValueStrategy: "NEVER_SKIP",
                        },
                        rightSide: {
                            expression: `#{${usedDataElement.id}}`,
                            description: `Vaccine doses used (${details})`,
                            slidingWindow: false,
                            missingValueStrategy: "NEVER_SKIP",
                        },
                        skipFormValidation: false,
                        organisationUnitLevels: [],
                    };
                }
            );
        });

        return _.concat(rules1, rules2);
    }

    private createCategoriesCombos(metadata: Metadata): PartialPersistedModel<D2CategoryCombo>[] {
        const categoriesByCode = _.keyBy(metadata.categories, c => c.code);
        const existingCategoryCombosByCode = _.keyBy(metadata.categoryCombos, cc => cc.code);

        return this.categoryCombos.flatMap(categoryCombo => {
            const [required = [], optional = []] = _.partition(
                categoryCombo.categories,
                c => c.required
            );

            return _(powerSet(optional))
                .map((comboForOptional): PartialPersistedModel<D2CategoryCombo> | undefined => {
                    const combo = [...required, ...comboForOptional];
                    const name = combo.map(c => c.name).join(" / ");
                    const code = "RVC_" + combo.map(c => c.code.replace(/^RVC_/, "")).join("_");
                    const codes = combo.map(c => c.code);
                    const existingCategoryCombo = existingCategoryCombosByCode[code];

                    return {
                        id:
                            existingCategoryCombo?.id ||
                            getUid("categoryCombo", code.replace(/-/g, "_")),
                        dataDimensionType: "DISAGGREGATION",
                        name: name,
                        code: code,
                        sharing: { public: "rw------" },
                        skipTotal: false,
                        categories: _.at(categoriesByCode, codes),
                    };
                })
                .compact()
                .value();
        });
    }

    private async getMetadata(): Promise<Metadata> {
        return this.api.metadata.get(metadataQuery).getData();
    }
}

const metadataQuery = {
    categoryOptionGroups: {
        fields: {
            id: true,
            name: true,
            code: true,
            categoryOptions: { id: true, code: true },
        },
        // RVC_ANTIGEN_antigen_DOSES
        // RVC_ANTIGEN_TYPE_SELECTABLE
        filter: { code: { $like: "RVC_ANTIGEN" } },
    },
    categories: {
        fields: {
            id: true,
            name: true,
            code: true,
            categoryOptions: { id: true },
        },
    },
    categoryCombos: {
        fields: { id: true, name: true, code: true },
    },
    dataElements: {
        fields: { $owner: true },
        filter: { code: { $like: "RVC_" } },
    },
    indicators: {
        fields: { $owner: true },
        filter: { code: { $like: "RVC_" } },
    },
    validationRules: {
        fields: { $owner: true },
        filter: { code: { $like: "RVC_" } },
    },
} as const;

type Metadata = MetadataPick<typeof metadataQuery>;

export function acronym(input: string): string {
    return input
        .split(" ") // split into words
        .map(word => word.slice(0, 3)) // take some first characters of each word
        .join(""); // join them again, without spaces
}

type AntigenInfo = {
    antigen: { name: string; code: string };
    disaggregations: {
        dose: number[];
        campaignType: CampaignType[];
    };
};
