import _ from "lodash";
import {
    D2Api,
    D2CategoryCombo,
    D2CategoryOptionCombo,
    D2DataElement,
    D2DataElementGroup,
    D2Indicator,
    D2ValidationRule,
    MetadataPick,
    PartialPersistedModel,
} from "@eyeseetea/d2-api/2.36";
import { CampaignType } from "../models/AntigensDisaggregationLegacy";
import { dataElementsInfo, indicatorsInfo, DataElementInfo } from "../models/D2CampaignMetadata";
import { cartesianProduct2, cartesianProduct3, powerSet } from "../utils/lodash-mixins";
import { interpolate } from "../utils/strings";
import { getUid } from "../utils/dhis2";
import { assert, throw_ } from "../utils/assert";
import fs from "fs";
import { getId } from "../models/db.types";
import { D2Translation } from "@eyeseetea/d2-api/schemas";

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

        const metadata0 = await this.getMetadata();

        const antigensWithCampaignTypeSelectable = assert(
            metadata0.categoryOptionGroups.find(cog => cog.code === "RVC_ANTIGEN_TYPE_SELECTABLE")
        ).categoryOptions;

        const antigenCogs = metadata0.categoryOptionGroups.filter(cog =>
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

        const categoryCombos = this.getCategoriesCombos(metadata0);
        categoryCombos.forEach(cc => {
            console.debug(
                `CategoryCombo: ${cc.name} [${cc.code}] (${cc.categories?.length} categories)`
            );
        });

        const metadata1: typeof metadata0 = {
            ...metadata0,
            categoryCombos: [
                ...(categoryCombos as typeof metadata0.categoryCombos),
                ...metadata0.categoryCombos,
            ],
        };

        const dataElements = dataElementsInfo.flatMap(dataElementConfig => {
            return antigens.flatMap(antigen => {
                return this.getDataElements(metadata1, dataElementConfig, {
                    antigen,
                    doseNum: null,
                    campaignType: null,
                });
            });
        });

        const dataElementGroups = this.getDataElementGroupsWithDisaggregatedDataElements(
            metadata1,
            antigens
        );

        const metadata: typeof metadata0 = {
            ...metadata1,
            dataElements: [
                ...(dataElements as typeof metadata0.dataElements),
                ...metadata1.dataElements,
            ],
        };

        const translations = this.getTranslations(metadata);

        const indicators = indicatorsInfo.flatMap(indicatorConfig => {
            const existingIndicator = metadata.indicators.find(
                ind => ind.code === indicatorConfig.modelCode
            );

            const antigens2 = indicatorConfig.disaggregations.includes("antigen")
                ? antigens
                : [null];

            return antigens2.flatMap(antigen => {
                const combos = cartesianProduct2([
                    indicatorConfig.disaggregations.includes("dose")
                        ? antigen?.disaggregations.dose || throw_(new Error())
                        : [null],
                    indicatorConfig.disaggregations.includes("campaignType")
                        ? antigen?.disaggregations.campaignType || throw_(new Error())
                        : [null],
                ]);

                return combos.map(([doseNum, campaignType]): PartialPersistedModel<D2Indicator> => {
                    const nameParts = _.compact([
                        indicatorConfig.name,
                        antigen?.antigen.name,
                        doseNum ? `Dose ${doseNum.toString()}` : null,
                        campaignType ? this.campaignTypes[campaignType].name : null,
                    ]);

                    const name = nameParts.join(" - ");

                    // Keep only the dose number (if present) in the form name
                    const formNameParts = _.compact([
                        indicatorConfig.name,
                        doseNum ? `Dose ${doseNum.toString()}` : null,
                    ]);

                    const indTranslations = translate(translations, [
                        ["NAME", nameParts],
                        ["DESCRIPTION", nameParts],
                    ]);

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

                    const namespace = _(dataElementsInfo)
                        .map((dataElementConfig): [string, string] => {
                            const dataElements = antigen
                                ? this.getDataElements(metadata, dataElementConfig, {
                                      antigen,
                                      doseNum,
                                      campaignType,
                                  })
                                : antigens.flatMap(antigen =>
                                      this.getDataElements(metadata, dataElementConfig, {
                                          antigen,
                                          doseNum,
                                          campaignType,
                                      })
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
                        ..._.omit(existingIndicator, ["created"]),
                        id: getUid("indicator", code.replace(/-/g, "_")),
                        ..._.omit(existingIndicator2, ["created"]),
                        translations: indTranslations,
                        name: name,
                        description: name,
                        shortName: shortName,
                        numerator: interpolate(indicatorConfig.numerator, namespace),
                        denominator: interpolate(indicatorConfig.denominator, namespace),
                        code: code,
                        formName: formNameParts.join(" - "),
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

        console.debug(`Creating ${categoryCombos.length} category combos...`);

        const validationRules = this.getValidationRules(metadata, antigens, dataElements);
        console.debug(`Creating ${validationRules.length} validation rules...`);

        const payload = _({
            dataElements,
            indicators,
            categoryCombos,
            validationRules,
            dataElementGroups,
        })
            .mapValues(objs => objs.map(obj => _.omit(obj, ["lastUpdated"])))
            .value();

        const payloadOutputBase = `new-disaggregations-metadata-base.json`;
        console.debug(`Saving metadata payload to ${payloadOutputBase}...`);
        fs.writeFileSync(payloadOutputBase, JSON.stringify(payload, null, 4), "utf-8");

        const res = await this.api.metadata
            .post(payload)
            .getData()
            .catch(err => {
                console.error("Error saving metadata:", JSON.stringify(err, null, 4));
                throw err;
            });

        const categoryOptionCombos = await this.buildCategoryOptionCombos(categoryCombos);

        const payload2 = { ...payload, categoryOptionCombos };

        const payloadOutput = `new-disaggregations-metadata.json`;
        console.debug(`Saving metadata payload to ${payloadOutput}...`);
        fs.writeFileSync(payloadOutput, JSON.stringify(payload2, null, 4), "utf-8");

        return res;
    }

    private getTranslations(metadata: Metadata): Translations {
        const categoryCodes = ["RVC_TYPE", "RVC_ANTIGEN", "RVC_DOSE"];
        const dataElementCodes = dataElementsInfo.map(de => de.modelCode);
        const indicatorCodes = indicatorsInfo.map(ind => ind.modelCode);

        const dataElements = _(metadata.dataElements)
            .filter(de => Boolean(de.code && dataElementCodes.includes(de.code)))
            .value();

        const indicators = _(metadata.indicators)
            .filter(ind => Boolean(ind.code && indicatorCodes.includes(ind.code)))
            .value();

        const categoryOptions = _(metadata.categories)
            .filter(category => categoryCodes.includes(category.code))
            .flatMap(category => category.categoryOptions)
            .value();

        const objects = _.concat(dataElements, indicators, categoryOptions);

        const translations = _(objects)
            .map(object => {
                return [object.name, object.translations] as [string, typeof object.translations];
            })
            .fromPairs()
            .value();

        const locales = _(translations)
            .flatMap(translations => translations.map(t => t.locale))
            .uniq()
            .value();

        return { locales: locales, translations: translations };
    }

    // Replace global DEs by disaggregated DEs in groups "RVC - Antigen - ANTIGEN - REQUIRED|OPTIONAL"
    private getDataElementGroupsWithDisaggregatedDataElements(
        metadata: Metadata,
        antigens: AntigenInfo[]
    ): PartialPersistedModel<D2DataElementGroup>[] {
        return _(antigens)
            .flatMap(antigen => {
                const degsForAntigen = metadata.dataElementGroups.filter(deg =>
                    deg.code.startsWith(`RVC_ANTIGEN_${antigen.antigen.code}`)
                );
                return degsForAntigen.map(degForAntigen => ({ antigen, degForAntigen }));
            })
            .map(({ antigen, degForAntigen }) => {
                const mapping = _(dataElementsInfo)
                    .map(dataElementConfig => {
                        const targetDataElements = this.getDataElements(
                            metadata,
                            dataElementConfig,
                            { antigen, doseNum: null, campaignType: null }
                        );

                        return [dataElementConfig.modelCode, targetDataElements] as [
                            typeof dataElementConfig.modelCode,
                            typeof targetDataElements
                        ];
                    })
                    .fromPairs()
                    .value();

                const dataElementsUpdated = degForAntigen.dataElements.flatMap(de => {
                    const deCode =
                        "code" in de && typeof de.code === "string" ? de.code : undefined;
                    const targetDataElements = deCode ? mapping[deCode] || [de] : [de];
                    return targetDataElements.map(de => ({ id: de.id }));
                });

                return _.isEqual(
                    degForAntigen.dataElements.map(getId),
                    dataElementsUpdated.map(getId)
                )
                    ? null
                    : { ...degForAntigen, dataElements: dataElementsUpdated };
            })
            .compact()
            .value();
    }

    private async buildCategoryOptionCombos(
        categoryCombos: PartialPersistedModel<D2CategoryCombo>[]
    ): Promise<PartialPersistedModel<D2CategoryOptionCombo>[]> {
        console.debug("Updating category option combos...");

        for (const cc of categoryCombos) {
            console.debug(`Generating COCs for category combo id=${cc.id} code=${cc.code}`);
            await this.api.maintenance.categoryOptionComboSingleUpdate(cc.id).getData();
        }

        const persisted = await this.api.metadata
            .get({
                categoryCombos: {
                    fields: {
                        id: true,
                        name: true,
                        categories: { categoryOptions: { id: true } },
                        categoryOptionCombos: { $owner: true },
                    },
                    filter: { id: { in: categoryCombos.map(cc => cc.id) } },
                },
            })
            .getData();

        // Validate COCs count
        persisted.categoryCombos.forEach(categoryCombo => {
            const expectedCocsCount = _(categoryCombo.categories)
                .map(category => category.categoryOptions.length)
                .reduce((a, b) => a * b, 1);

            if (categoryCombo.categoryOptionCombos.length !== expectedCocsCount) {
                console.debug(
                    `Warning: category combo id=${categoryCombo.id} name=${categoryCombo.name} has ${categoryCombo.categoryOptionCombos.length} COCs, expected ${expectedCocsCount}`
                );
            } else {
                console.debug(
                    `Category combo id=${categoryCombo.id} name=${categoryCombo.name} has the expected number of COCs: ${expectedCocsCount}`
                );
            }
        });

        const categoryOptionCombos = _(persisted.categoryCombos)
            .flatMap(cc => cc.categoryOptionCombos)
            .value();

        return categoryOptionCombos;
    }

    private getDataElements(
        metadata: Metadata,
        dataElementConfig: DataElementInfo,
        options: {
            antigen: AntigenInfo;
            doseNum: number | null;
            campaignType: CampaignType | null;
        }
    ) {
        const { antigen, doseNum, campaignType } = options;
        const combos = cartesianProduct3([
            dataElementConfig.disaggregations.includes("antigen") ? [antigen] : [null],
            dataElementConfig.disaggregations.includes("dose")
                ? doseNum
                    ? [doseNum]
                    : antigen.disaggregations.dose
                : [null],
            dataElementConfig.disaggregations.includes("campaignType")
                ? campaignType
                    ? [campaignType]
                    : antigen.disaggregations.campaignType
                : [null],
        ]);

        const translations = this.getTranslations(metadata);

        return combos.map(
            ([antigen, doseNum, campaignType]): PartialPersistedModel<D2DataElement> => {
                const existingDataElement = metadata.dataElements.find(
                    de => de.code === dataElementConfig.modelCode
                );

                const nameParts = _.compact([
                    dataElementConfig.name,
                    antigen ? antigen.antigen.name : null,
                    doseNum ? `Dose ${doseNum.toString()}` : null,
                    campaignType ? this.campaignTypes[campaignType].name : null,
                ]);

                const name = nameParts.join(" - ");

                // Keep only the dose number (if present) in the form name
                const formNameParts = _.compact([
                    dataElementConfig.name,
                    doseNum ? `Dose ${doseNum.toString()}` : null,
                ]);

                const deTranslations = translate(translations, [
                    ["NAME", nameParts],
                    ["DESCRIPTION", nameParts],
                    ["FORM_NAME", formNameParts],
                ]);

                const code = _.compact([
                    dataElementConfig.code,
                    antigen ? antigen.antigen.code : null,
                    doseNum,
                    campaignType ? this.campaignTypes[campaignType].code : null,
                ]).join("-");

                const shortName = name
                    .split(" - ")
                    .map(n => acronym(n))
                    .join(" ");

                return {
                    domainType: "AGGREGATE",
                    aggregationType: "SUM",
                    ...(existingDataElement ? _.omit(existingDataElement, ["created"]) : {}),
                    translations: deTranslations,
                    valueType: dataElementConfig.valueType,
                    id: getUid("dataElement", code.replace(/-/g, "_")),
                    name: name,
                    description: name,
                    shortName: shortName,
                    formName: formNameParts.join(" - "),
                    code: code,
                    zeroIsSignificant: dataElementConfig.storeZeroDataValues,
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
            }
        );
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

    private getCategoriesCombos(metadata: Metadata) {
        const categoriesByCode = _.keyBy(metadata.categories, c => c.code);
        const existingCategoryCombosByCode = _.keyBy(metadata.categoryCombos, cc => cc.code);

        return this.categoryCombos.flatMap(categoryCombo => {
            const [required = [], optional = []] = _.partition(
                categoryCombo.categories,
                c => c.required
            );

            return _(powerSet(optional))
                .map((comboForOptional): PartialPersistedModel<D2CategoryCombo> => {
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
                        categories: _.at(categoriesByCode, codes).map(cat => ({ id: cat.id })),
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
            categoryOptions: {
                name: true,
                translations: { locale: true, property: true, value: true },
            },
        },
    },
    categoryCombos: {
        fields: { id: true, name: true, code: true },
    },
    dataElements: {
        fields: { $owner: true },
        filter: { code: { $like: "RVC_" } },
    },
    dataElementGroups: {
        fields: { $owner: true, dataElements: { id: true, code: true } },
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

type Translations = {
    locales: string[];
    translations: Record<string, Array<{ locale: string; property: string; value: string }>>;
};

function translate(
    translations: Translations,
    parts: Array<["NAME" | "DESCRIPTION" | "FORM_NAME", string[]]>
): Array<{ locale: string; property: string; value: string }> {
    return translations.locales.flatMap((locale): D2Translation[] => {
        return parts.map(([prop, partsForProp]) => {
            const partsTranslated = partsForProp.map(part => {
                const translationsForPart = translations.translations[part];
                const translationForProp = translationsForPart?.find(
                    t => t.locale === locale && t.property === prop
                );
                const translationForName = translationsForPart?.find(
                    t => t.locale === locale && t.property === "NAME"
                );
                return translationForProp?.value || translationForName?.value || part;
            });

            return {
                locale: locale,
                property: prop,
                value: partsTranslated.join(" - "),
            };
        });
    });
}
