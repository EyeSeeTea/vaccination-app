import _ from "lodash";
import i18n from "@dhis2/d2-i18n";

const translations = {
    no_organisation_units_selected: () => i18n.t("Select at least one organisation unit"),
    organisation_units_only_of_levels: namespace =>
        i18n.t("Only organisation units of level {{levels}} can be selected", namespace),

    cannot_be_blank: namespace => i18n.t("Field {{field}} cannot be blank", namespace),
    cannot_be_blank_if_other_set: namespace =>
        i18n.t("Field {{field}} cannot be blank if field {{other}} is set", namespace),

    no_antigens_selected: () => i18n.t("Select at least one antigen"),

    select_at_least_one_option_for_category: () =>
        i18n.t("You must select at least one category option"),

    no_target_population_defined: () => i18n.t("No target population defined"),
    total_population_invalid: namespace =>
        i18n.t(
            "Org unit {{organisationUnit}} has an invalid total population value -> {{value}}",
            namespace
        ),

    age_groups_population_invalid: namespace =>
        i18n.t(
            "Org unit {{organisationUnit}} has invalid distribution values for age ranges -> {{ageGroups}}",
            namespace
        ),

    age_groups_population_for_antigen_invalid: namespace =>
        i18n.t(
            "Org unit {{organisationUnit}} has an invalid total value for antigen {{antigen}} ({{ageGroups}}) -> {{- value}}",
            namespace
        ),
    must_be_bigger_than_zero: () => i18n.t("Number of teams must be positive"),
    name_must_be_unique: () => i18n.t("Campaign name requires a unique value"),
};

export async function getValidationMessages(campaign, validationKeys) {
    if (_(validationKeys).isEmpty()) return [];

    const validationObj = await campaign.validate();

    return _(validationObj)
        .at(validationKeys)
        .flatten()
        .compact()
        .map(error => {
            const translation = translations[error.key];
            if (translation) {
                return i18n.t(translation(error.namespace));
            } else {
                return `Missing translation: ${error.key}`;
            }
        })
        .value();
}
