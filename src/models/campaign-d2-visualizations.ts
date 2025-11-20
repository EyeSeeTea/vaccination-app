import { assert } from "../utils/assert";
import Campaign from "./campaign";
import { getFormDataElements, getIndicators } from "./D2CampaignMetadata";
import { baseConfig } from "./config";

/**
 * Process disaggregations for D2 visualizations.
{
    "name": "Example - Mbutu - Rotavirus - Coverage by age range and dose",
    "dataDimensionItems": [
        {"dataElement": {"id": "mkgnDxyksQS"}, "dataDimensionItemType": "DATA_ELEMENT"},
        {"indicator": {"id": "WmC8n3y13Mo"}, "dataDimensionItemType": "INDICATOR"}
    ],
    "columns": [{"id": "dx"}, {"id": "uaaMNSXGGTT"}, {"id": "WuatkvLRte5"}],
    "rows": [],
    "filters": [{"id": "pe"}, {"id": "ou"}, {"id": "a6SQVBY9s18"}]
}
 *
 * Actions:
 * 
 * - Move antigen/dose/type disaggregations from columns/filters to dataDimensionItems 
 */
export function processDisaggregations(options: {
    title: () => string;
    campaign: Campaign;
    antigen: { id: string } | null;
    dose: { doseId: string; name: string };
    data: ModelDataDimensionItem[];
    disaggregations: Array<{ categoryId: string }>;
}): D2VisualizationOverride {
    const { campaign, antigen, dose, data } = options;
    const enabled = campaign.getEnabledAntigensDisaggregation();
    const ageGroupCategory = assert(
        campaign.config.categories.find(
            category => category.code === baseConfig.categoryCodeForDoses
        )
    );
    const dosesCategory = assert(
        campaign.config.categories.find(
            category => category.code === baseConfig.categoryCodeForDoses
        )
    );
    const disaggregations2 = options.disaggregations.filter(
        dd => dd.categoryId !== ageGroupCategory.id
    );
    //if (!antigen) return { data, disaggregations: disaggregations2 };

    const dd = antigen ? assert(enabled.find(x => x.antigen.id === antigen.id)) : undefined;
    const res = dd ? getFormDataElements(campaign, dd) : [];
    const dataDimensionItems = data;
    const doseNum = dose ? parseInt(assert(dose.name.match(/(\d)/)?.[1])) : undefined;
    const disaggregatedByDose = options.disaggregations.some(
        dd => dd.categoryId === dosesCategory.id
    );

    const data2 = dataDimensionItems.flatMap(ddi => {
        switch (ddi.dataDimensionItemType) {
            case "DATA_ELEMENT": {
                const mappedIndicators = dd
                    ? getIndicators(campaign, dd, ddi.dataElement.code, doseNum)
                    : [];

                if (!disaggregatedByDose && !doseNum && mappedIndicators.length > 0) {
                    // Use an indicator to display data elements when the dose is not specified
                    // Current use cases: Doses Administered, AEFI.

                    return mappedIndicators.map((indicator): D2DataDimensionItem => {
                        return {
                            dataDimensionItemType: "INDICATOR",
                            indicator: { id: indicator.id },
                        };
                    });
                } else {
                    const matching = res.filter(
                        x =>
                            x.info?.modelCode === ddi.dataElement.code &&
                            (!doseNum || x.doseNum === doseNum)
                    );

                    if (matching.length === 0) {
                        return [ddi];
                    } else {
                        return matching.map((dataElement): D2DataDimensionItem => {
                            return {
                                dataDimensionItemType: "DATA_ELEMENT",
                                dataElement: { id: dataElement.formDataElement.id },
                            };
                        });
                    }
                }
            }
            case "INDICATOR": {
                const mappedIndicators = dd
                    ? getIndicators(campaign, dd, ddi.indicator.code, doseNum)
                    : [];

                return mappedIndicators.length > 0
                    ? mappedIndicators.map((indicator): D2DataDimensionItem => {
                          return {
                              dataDimensionItemType: "INDICATOR",
                              indicator: { id: indicator.id },
                          };
                      })
                    : [ddi];
            }
        }
    });

    return { data: data2, disaggregations: disaggregations2 };
}

type Id = string;

type D2VisualizationOverride = {
    data: D2DataDimensionItem[];
    disaggregations: Array<{ categoryId: string }>;
};

type ModelDataDimensionItem =
    | { dataElement: { id: Id; code: string }; dataDimensionItemType: "DATA_ELEMENT" }
    | { indicator: { id: Id; code: string }; dataDimensionItemType: "INDICATOR" };

type D2DataDimensionItem =
    | { dataElement: { id: Id }; dataDimensionItemType: "DATA_ELEMENT" }
    | { indicator: { id: Id }; dataDimensionItemType: "INDICATOR" };
