import _ from "lodash";
import { assert } from "../utils/assert";
import {
    cartesianProduct2,
    cartesianProduct3,
    fromPairs,
    zipShortest,
} from "../utils/lodash-mixins";
import {
    CampaignType,
    AntigenDisaggregationEnabledDataElement,
    AntigenDisaggregationEnabled,
} from "./AntigensDisaggregationLegacy";
import Campaign from "./campaign";
import { getRvcCode, MetadataConfig, baseConfig, Dose } from "./config";
import { Ref } from "./db.types";

export type DisaggregationType = "antigen" | "dose" | "campaignType";

export const allDisaggregationTypes: DisaggregationType[] = ["antigen", "dose", "campaignType"];

export type DataElementInfo = {
    name: string;
    code: string;
    modelCode: string;
    disaggregations: DisaggregationType[];
    categoryCombo: { name?: string; code?: string };
    newEntity?: boolean;
    storeZeroDataValues: boolean;
    valueType: "NUMBER" | "INTEGER_ZERO_OR_POSITIVE";
};

export const dataElementsInfo: DataElementInfo[] = [
    // Data elements to be shown in every antigen section
    {
        name: "Vaccine doses administered",
        code: "RVC_DA",
        modelCode: "RVC_DOSES_ADMINISTERED",
        disaggregations: ["antigen", "dose", "campaignType"],
        categoryCombo: { name: "default" },
        storeZeroDataValues: true,
        valueType: "INTEGER_ZERO_OR_POSITIVE",
    },
    {
        name: "Vaccine doses used",
        code: "RVC_DU",
        modelCode: "RVC_DOSES_USED",
        disaggregations: ["antigen", "campaignType"],
        categoryCombo: { name: "default" },
        storeZeroDataValues: true,
        valueType: "INTEGER_ZERO_OR_POSITIVE",
    },
    {
        name: "Adverse Event Following Immunization",
        code: "RVC_AEFI",
        modelCode: "RVC_AEFI",
        disaggregations: ["antigen", "campaignType"],
        categoryCombo: { code: "RVC_SEVERITY" },
        storeZeroDataValues: true,
        valueType: "INTEGER_ZERO_OR_POSITIVE",
    },
    {
        name: "Needles for dilution",
        code: "RVC_NEEDLES",
        modelCode: "RVC_NEEDLES",
        disaggregations: ["antigen", "campaignType"],
        categoryCombo: { name: "default" },
        storeZeroDataValues: true,
        valueType: "INTEGER_ZERO_OR_POSITIVE",
    },
    {
        name: "Syringes for dilution",
        code: "RVC_SYRINGES",
        modelCode: "RVC_SYRINGES",
        disaggregations: ["antigen", "campaignType"],
        categoryCombo: { name: "default" },
        storeZeroDataValues: true,
        valueType: "INTEGER_ZERO_OR_POSITIVE",
    },
    // Population
    {
        name: "Population by age",
        code: "RVC_POPULATION_BY_AGE",
        modelCode: "RVC_POPULATION_BY_AGE",
        disaggregations: ["antigen", "dose"],
        categoryCombo: { code: "RVC_AGE_GROUP" },
        storeZeroDataValues: false,
        valueType: "NUMBER",
    },
    // Skip data elements without disaggregation:
    //   RVC_ADS_USED
    //   RVC_AGE_DISTRIBUTION,
    //   RVC_SAFETY_BOXES
    //   RVC_TOTAL_POPULATION
];

type Indicator = {
    name: string;
    code: string;
    modelCode: string;
    disaggregations: DisaggregationType[];
    newEntity?: boolean;
    numerator: string;
    denominator: string;
    numeratorDescription?: string;
    denominatorDescription?: string;
};

export const indicatorsInfo: Indicator[] = [
    // New, now doses administered are disaggregated by dose, so we need an indicator for the total
    {
        newEntity: true,
        name: "Vaccine doses administered",
        code: "RVC_DOSES_ADMINISTERED",
        modelCode: "RVC_DOSES_ADMINISTERED",
        disaggregations: ["antigen", "campaignType"],
        numerator: "{RVC_DA}",
        numeratorDescription: "Sum of all doses administered for antigen",
        denominator: "1",
        denominatorDescription: "One",
    },
    {
        newEntity: true,
        name: "Adverse Event Following Immunization (AEFI)",
        code: "RVC_AEFI_ALL_ANTIGENS",
        modelCode: "RVC_AEFI_ALL_ANTIGENS",
        disaggregations: [],
        numerator: "{RVC_AEFI}",
        numeratorDescription: "Sum of AEFI reported for all antigens",
        denominator: "1",
        denominatorDescription: "One",
    },
    {
        name: "Vaccine campaign coverage (%)",
        code: "RVC_COVERAGE",
        modelCode: "RVC_CAMPAIGN_COVERAGE",
        disaggregations: ["antigen", "dose", "campaignType"],
        numerator: "{RVC_DA}",
        denominator: "{RVC_POPULATION_BY_AGE}",
    },
    {
        name: "Vaccine utilization rate (%)",
        code: "RVC_VU",
        modelCode: "RVC_VACCINE_UTILIZATION",
        disaggregations: ["antigen", "campaignType"],
        numerator: "{RVC_DA}",
        denominator: "{RVC_DU}",
    },
    {
        name: "Dilution Syringe / Vaccine Vial Ratio",
        code: "RVC_SYRINGES_RATIO",
        modelCode: "RVC_DILUTION_SYRINGES_RATIO",
        disaggregations: ["antigen", "campaignType"],
        numerator: "{RVC_SYRINGES}",
        denominator: "{RVC_DU} / 10",
    },
    {
        name: "Dilution Needle / Vaccine Vial Ratio",
        code: "RVC_NEEDLES_RATIO",
        modelCode: "RVC_CAMPAIGN_NEEDLES_RATIO",
        disaggregations: ["antigen", "campaignType"],
        numerator: "{RVC_NEEDLES}",
        denominator: "{RVC_DU} / 10",
    },
    {
        name: "ADS (Auto Disable Syringe) wastage rate (%)",
        code: "RVC_ADS_WASTAGE",
        modelCode: "RVC_ADS_WASTAGE",
        disaggregations: [],
        numerator: "{RVC_ADS_USED} - {RVC_DA}",
        denominator: "{RVC_ADS_USED}",
    },
];

export const campaignTypes: Record<CampaignType, { name: string; code: string }> = {
    preventive: { name: "Preventive", code: "PREVENTIVE" },
    reactive: { name: "Reactive", code: "REACTIVE" },
};

type DataElementDisaggregated = {
    dataElement: AntigenDisaggregationEnabledDataElement;
    formDataElement: DataElementRef;
    categoryCombo: Ref;
    doseNum: number | undefined;
    info: DataElementInfo | undefined;
};

export function getDisaggregatedDataElements(
    campaign: Campaign,
    disaggregation: AntigenDisaggregationEnabled[0]
): DataElementDisaggregated[] {
    return disaggregation.dataElements.flatMap(dataElement => {
        const dataElementConfig = dataElementsInfo.find(de => de.modelCode === dataElement.code);

        const categoriesForCategoryCombo = _(dataElement.categories)
            .reject(category => categoriesInDataElement.includes(category.code))
            .value();

        const categoryComboCode =
            categoriesForCategoryCombo.length > 0
                ? assert(getRvcCode(_.uniq(categoriesForCategoryCombo.map(c => c.code))))
                : "default";

        const categoryCombo = campaign.config.categoryCombos.find(
            categoryCombo => categoryCombo.code === categoryComboCode
        );

        if (!dataElementConfig) {
            const formDataElement = assert(
                campaign.config.dataElements.find(de => dataElement.code === de.code),
                `DataElement not found: ${dataElement.code}`
            );

            const categoryCombo2 = categoryCombo || formDataElement.categoryCombo;

            return [
                {
                    dataElement,
                    formDataElement,
                    categoryCombo: categoryCombo2,
                    doseNum: undefined,
                    info: undefined,
                },
            ];
        } else {
            const { antigen } = disaggregation;
            const combos = cartesianProduct3([
                dataElementConfig.disaggregations.includes("antigen") ? [antigen] : [undefined],
                dataElementConfig.disaggregations.includes("dose")
                    ? antigen.doses.map(dose => dose.name.match(/(\d+)/)?.[0])
                    : [undefined],
                dataElementConfig.disaggregations.includes("campaignType")
                    ? [assert(disaggregation.type)]
                    : [undefined],
            ]);

            return _(combos)
                .map(([antigen, doseNum, campaignType]): DataElementDisaggregated | null => {
                    const code = _.compact([
                        dataElementConfig.code,
                        antigen ? getAntigenCode(antigen.code) : undefined,
                        doseNum,
                        campaignType ? campaignTypes[campaignType].code : undefined,
                    ]).join("-");

                    const formDataElement = assert(
                        campaign.config.dataElements.find(de => de.code === code),
                        `DataElement not found: ${code}`
                    );

                    const categoryCombo2 = categoryCombo || formDataElement.categoryCombo;
                    const dis = getDataElementDisaggregations(formDataElement, campaign.config);

                    const doseNumInDisaggregation = dataElementConfig.disaggregations.includes(
                        "dose"
                    )
                        ? categoriesForCategoryCombo.some(
                              category =>
                                  !category.onlyForCategoryOptionIds ||
                                  (dis &&
                                      dis.dose &&
                                      category.onlyForCategoryOptionIds.includes(
                                          dis.dose.categoryOption.id
                                      ))
                          )
                        : true;

                    if (!doseNumInDisaggregation) return null;

                    return {
                        dataElement: dataElement,
                        formDataElement: formDataElement,
                        categoryCombo: categoryCombo2,
                        doseNum: doseNum ? parseInt(doseNum) : undefined,
                        info: dataElementConfig,
                    };
                })
                .compact()
                .value();
        }
    });
}

type DataElementRef = { id: string; code: string };

export function getDataElements(
    campaign: Campaign,
    dd: AntigenDisaggregationEnabled[0],
    modelCode: string,
    dose: Dose
) {
    return dataElementsInfo.flatMap(dataElementConfig => {
        if (dataElementConfig.modelCode !== modelCode) return [];

        const { antigen } = dd;

        const combos = cartesianProduct2([
            dataElementConfig.disaggregations.includes("dose") ? [dose] : [undefined],
            dataElementConfig.disaggregations.includes("campaignType")
                ? [assert(dd.type)]
                : [undefined],
        ]);

        return combos.map(([dose, campaignType]) => {
            const code = _.compact([
                dataElementConfig.code,
                getAntigenCode(antigen.code),
                dose ? assert(dose.name.match(/(\d+)/))[0] : undefined,
                campaignType ? campaignTypes[campaignType].code : undefined,
            ]).join("-");

            return assert(
                campaign.config.dataElements.find(ind => ind.code === code),
                `DataElement not found: ${code}`
            );
        });
    });
}

export function getAntigenCode(longCode: string): string {
    return longCode.replace(/^RVC_ANTIGEN_/, "");
}

export function getIndicators(
    campaign: Campaign,
    dd: AntigenDisaggregationEnabled[0],
    modelCode: string,
    doseNum: number | undefined
) {
    return indicatorsInfo.flatMap(indicatorConfig => {
        if (indicatorConfig.modelCode !== modelCode) return [];

        const { antigen } = dd;

        const combos = cartesianProduct2([
            indicatorConfig.disaggregations.includes("dose")
                ? doseNum
                    ? [doseNum.toString()]
                    : antigen.doses.map(dose => dose.name.match(/(\d+)/)?.[0])
                : [undefined],
            indicatorConfig.disaggregations.includes("campaignType")
                ? [assert(dd.type)]
                : [undefined],
        ]);

        return combos.map(([doseNum2, campaignType]) => {
            const code = _.compact([
                indicatorConfig.code,
                getAntigenCode(antigen.code),
                doseNum2,
                campaignType ? campaignTypes[campaignType].code : undefined,
            ]).join("-");

            return assert(
                campaign.config.indicators.find(ind => ind.code === code),
                `Indicator not found: ${code}`
            );
        });
    });
}

type CategoryOptionValue = string; // name or code

type Disaggregation = Partial<Record<DisaggregationType, CategoryOptionValue>>;

export function getDataElementFromDisaggregation(
    dataElementConfig: DataElementInfo,
    dataElements: DataElementRef[],
    disaggregation: Disaggregation
): DataElementRef {
    const dataElementCode = _.compact([
        dataElementConfig.code,
        disaggregation.antigen?.replace(/^RVC_ANTIGEN_/, ""),
        disaggregation.dose?.match(/(\d+)/)?.[0],
        disaggregation.campaignType?.replace(/^RVC_/, ""),
    ]).join("-");

    return assert(
        dataElements.find(de => de.code === dataElementCode),
        `dataElement not found: ${dataElementCode}`
    );
}

export const categoriesInDataElement = ["RVC_ANTIGEN", "RVC_DOSE", "RVC_TYPE"];

export function getDataElementDisaggregations(
    dataElement: { code: string },
    config: MetadataConfig
): Record<DisaggregationType, { categoryOption: Ref } | undefined> {
    const dataElementInfo = dataElementsInfo.find(de => dataElement.code.startsWith(de.code));
    const [_dataElementPrefix, ...restCode] = dataElement.code.split("-");
    const disaggregations = dataElementInfo ? dataElementInfo.disaggregations : [];
    const mapping: Partial<Record<DisaggregationType, string>> = fromPairs(
        zipShortest(disaggregations, restCode)
    );

    return {
        antigen: mapping["antigen"]
            ? {
                  categoryOption: assert(
                      assert(
                          config.categories.find(
                              category => category.code === baseConfig.categoryCodeForAntigens
                          )
                      ).categoryOptions.find(co => co.code === `RVC_ANTIGEN_${mapping["antigen"]}`)
                  ),
              }
            : undefined,

        dose: mapping["dose"]
            ? {
                  categoryOption: assert(
                      assert(
                          config.categories.find(
                              category => category.code === baseConfig.categoryCodeForDoses
                          )
                      ).categoryOptions.find(co => co.name === `Dose ${mapping["dose"]}`)
                  ),
              }
            : undefined,

        campaignType: mapping["campaignType"]
            ? {
                  categoryOption: assert(
                      assert(
                          config.categories.find(
                              category => category.code === baseConfig.categoryCodeForCampaignType
                          )
                      ).categoryOptions.find(co => co.code === `RVC_${mapping["campaignType"]}`)
                  ),
              }
            : undefined,
    };
}
