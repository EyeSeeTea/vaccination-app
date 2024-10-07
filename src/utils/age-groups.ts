import _ from "lodash";
import "./lodash-mixins";
import { Category, CategoryOption } from "../models/db.types";

interface SortConfig {
    categoryComboCodeForAgeGroup: string;
    categories: Category[];
}

export function sortAgeGroups(
    config: SortConfig,
    categoryOptions: CategoryOption[]
): CategoryOption[] {
    const ageGroupCategory = _(config.categories)
        .keyBy(category => category.code)
        .getOrFail(config.categoryComboCodeForAgeGroup);

    const indexByName: _.Dictionary<number> = _(ageGroupCategory.categoryOptions)
        .map((co, idx) => [co.displayName, idx])
        .fromPairs()
        .value();

    return _.sortBy(
        categoryOptions,
        categoryOption => indexByName[categoryOption.displayName] || 0
    );
}
