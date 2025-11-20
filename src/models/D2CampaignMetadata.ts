import _ from "lodash";
import { assert } from "../utils/assert";
import { cartesianProduct2, fromPairs, zipShortest } from "../utils/lodash-mixins";
import {
    CampaignType,
    AntigenDisaggregationEnabledDataElement,
    AntigenDisaggregationEnabled,
} from "./AntigensDisaggregationLegacy";
import Campaign from "./campaign";
import { getRvcCode, MetadataConfig, baseConfig } from "./config";
import { DataElement, Ref } from "./db.types";

export type DisaggregationType = "antigen" | "dose" | "campaignType";

export type NewDataElement = {
    name: string;
    code: string;
    modelCode: string;
    extraDisaggregations: DisaggregationType[];
    categoryCombo: { name?: string; code?: string };
    newEntity?: boolean;
};

export const dataElementsByAntigen: NewDataElement[] = [
    // Data elements to be shown in every antigen section
    {
        name: "Vaccine doses administered",
        code: "RVC_DA",
        modelCode: "RVC_DOSES_ADMINISTERED",
        extraDisaggregations: ["dose", "campaignType"],
        categoryCombo: { name: "default" },
    },
    {
        name: "Vaccine doses used",
        code: "RVC_DU",
        modelCode: "RVC_DOSES_USED",
        extraDisaggregations: ["campaignType"],
        categoryCombo: { name: "default" },
    },
    {
        name: "Adverse Event Following Immunization",
        code: "RVC_AEFI",
        modelCode: "RVC_AEFI",
        extraDisaggregations: ["campaignType"],
        categoryCombo: { code: "RVC_SEVERITY" },
    },
    {
        name: "Needles for dilution",
        code: "RVC_NEEDLES",
        modelCode: "RVC_NEEDLES",
        extraDisaggregations: ["campaignType"],
        categoryCombo: { name: "default" },
    },
    {
        name: "Syringes for dilution",
        code: "RVC_SYRINGES",
        modelCode: "RVC_SYRINGES",
        extraDisaggregations: ["campaignType"],
        categoryCombo: { name: "default" },
    },
    // Skip General Q&S (ADS, AEB, Safety boxes), common to all antigens
    // Population
    {
        name: "Population by age",
        code: "RVC_POPULATION_BY_AGE",
        modelCode: "RVC_POPULATION_BY_AGE",
        extraDisaggregations: ["campaignType"],
        categoryCombo: { code: "RVC_AGE_GROUP" },
    },
    // RVC_AGE_DISTRIBUTION -> informative, not used in formulas, not by antigen
];

type NewIndicator = {
    name: string;
    code: string;
    modelCode: string;
    extraDisaggregations: DisaggregationType[];
    newEntity?: boolean;
    numerator: string;
    denominator: string;
    numeratorDescription?: string;
    denominatorDescription?: string;
};

export const indicatorsByAntigen: NewIndicator[] = [
    // New, now doses administered are disaggregated by dose, so we need an indicator for the total
    {
        newEntity: true,
        name: "Vaccine doses administered",
        code: "RVC_DOSES_ADMINISTERED",
        modelCode: "RVC_DOSES_ADMINISTERED",
        extraDisaggregations: ["antigen", "campaignType"],
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
        extraDisaggregations: [],
        numerator: "{RVC_AEFI}",
        numeratorDescription: "Sum of AEFI reported for all antigens",
        denominator: "1",
        denominatorDescription: "One",
    },
    {
        name: "Vaccine Campaign coverage",
        code: "RVC_COVERAGE",
        modelCode: "RVC_CAMPAIGN_COVERAGE",
        extraDisaggregations: ["antigen", "dose", "campaignType"],
        numerator: "{RVC_DA}",
        denominator: "{RVC_POPULATION_BY_AGE}",
    },
    {
        name: "Vaccine utilization",
        code: "RVC_VU",
        modelCode: "RVC_VACCINE_UTILIZATION",
        extraDisaggregations: ["antigen", "campaignType"],
        numerator: "{RVC_DA}",
        denominator: "{RVC_DU}",
    },
    {
        name: "Dilution syringes ratio",
        code: "RVC_SYRINGES_RATIO",
        modelCode: "RVC_DILUTION_SYRINGES_RATIO",
        extraDisaggregations: ["antigen", "campaignType"],
        numerator: "{RVC_SYRINGES}",
        denominator: "{RVC_DU} / 10",
    },
    {
        name: "Campaign needles ratio",
        code: "RVC_NEEDLES_RATIO",
        modelCode: "RVC_CAMPAIGN_NEEDLES_RATIO",
        extraDisaggregations: ["antigen", "campaignType"],
        numerator: "{RVC_NEEDLES}",
        denominator: "{RVC_DU} / 10",
    },
    {
        name: "ADS (Auto Disable Syringe) wastage rate (%)",
        code: "RVC_ADS_WASTAGE",
        modelCode: "RVC_ADS_WASTAGE",
        extraDisaggregations: [],
        numerator: "{RVC_ADS_USED} - {RVC_DA}",
        denominator: "{RVC_ADS_USED}",
    },
];

export const campaignTypes: Record<CampaignType, { name: string; code: string }> = {
    preventive: { name: "Preventive", code: "PREVENTIVE" },
    reactive: { name: "Reactive", code: "REACTIVE" },
};

type FormDataElement = {
    dataElement: AntigenDisaggregationEnabledDataElement;
    formDataElement: DataElement;
    categoryCombo: Ref;
    doseNum: number | undefined;
    info: NewDataElement | undefined;
};

export function getFormDataElements(
    campaign: Campaign,
    dd: AntigenDisaggregationEnabled[0]
): FormDataElement[] {
    return dd.dataElements.flatMap(dataElement => {
        const dataElementConfig = dataElementsByAntigen.find(
            de => de.modelCode === dataElement.code
        );

        const categoriesForCategoryCombo = _(dataElement.categories)
            .reject(category => categoriesInDataElement.includes(category.code))
            .value();

        const categoryComboCode =
            categoriesForCategoryCombo.length > 0
                ? assert(getRvcCode(_.uniq(categoriesForCategoryCombo.map(c => c.code))))
                : "default";

        const categoryCombo = campaign.config.categoryCombos.find(
            cc => cc.code === categoryComboCode
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
            const { antigen } = dd;
            const combos = cartesianProduct2([
                dataElementConfig.extraDisaggregations.includes("dose")
                    ? antigen.doses.map(dose => dose.name.match(/(\d+)/)?.[0])
                    : [undefined],
                dataElementConfig.extraDisaggregations.includes("campaignType")
                    ? [assert(dd.type)]
                    : [undefined],
            ]);

            return _(combos)
                .map(([doseNum, campaignType]): FormDataElement | null => {
                    const code = _.compact([
                        dataElementConfig.code,
                        getAntigenCode(antigen.code),
                        doseNum,
                        campaignType ? campaignTypes[campaignType].code : undefined,
                    ]).join("-");

                    const formDataElement = assert(
                        campaign.config.dataElements.find(de => de.code === code),
                        `DataElement not found: ${code}`
                    );

                    const categoryCombo2 = categoryCombo || formDataElement.categoryCombo;
                    const dis = getDataElementDisaggregations(formDataElement, campaign.config);

                    const doseNumInDisaggregation = dataElementConfig.extraDisaggregations.includes(
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

type De = { id: string; code: string };

export function getDataElements(
    campaign: Campaign,
    dd: AntigenDisaggregationEnabled[0],
    modelCode: string,
    doseNum: number | undefined
): De[] {
    return dataElementsByAntigen.flatMap(dataElementConfig => {
        if (dataElementConfig.modelCode !== modelCode) return [];

        const { antigen } = dd;

        const combos = cartesianProduct2([
            dataElementConfig.extraDisaggregations.includes("dose")
                ? doseNum
                    ? [doseNum.toString()]
                    : antigen.doses.map(dose => dose.name.match(/(\d+)/)?.[0])
                : [undefined],
            dataElementConfig.extraDisaggregations.includes("campaignType")
                ? [assert(dd.type)]
                : [undefined],
        ]);

        return combos.map(([doseNum2, campaignType]) => {
            const code = _.compact([
                dataElementConfig.code,
                getAntigenCode(antigen.code),
                doseNum2,
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
type Indicator = { id: string; code: string };

export function getIndicators(
    campaign: Campaign,
    dd: AntigenDisaggregationEnabled[0],
    modelCode: string,
    doseNum: number | undefined
): Indicator[] {
    return indicatorsByAntigen.flatMap(indicatorConfig => {
        if (indicatorConfig.modelCode !== modelCode) return [];

        const { antigen } = dd;

        const combos = cartesianProduct2([
            indicatorConfig.extraDisaggregations.includes("dose")
                ? doseNum
                    ? [doseNum.toString()]
                    : antigen.doses.map(dose => dose.name.match(/(\d+)/)?.[0])
                : [undefined],
            indicatorConfig.extraDisaggregations.includes("campaignType")
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

export const categoriesInDataElement = ["RVC_ANTIGEN", "RVC_DOSE", "RVC_TYPE"];

export function getDataElementDisaggregations(
    dataElement: { code: string },
    config: MetadataConfig
): Record<DisaggregationType, { categoryOption: Ref } | undefined> {
    const de = dataElementsByAntigen.find(de => dataElement.code.startsWith(de.code));
    const [_dataElementPrefix, ...restCode] = dataElement.code.split("-");
    const disaggregations: DisaggregationType[] = de ? ["antigen", ...de.extraDisaggregations] : [];
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
