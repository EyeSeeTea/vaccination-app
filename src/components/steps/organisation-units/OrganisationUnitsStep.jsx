import React from "react";
import PropTypes from "prop-types";
import _ from "lodash";
import i18n from "@dhis2/d2-i18n";
import { OrgUnitsSelector } from "d2-ui-components";
import { FormBuilder } from "@dhis2/d2-ui-forms";
import { TextField } from "@dhis2/d2-ui-core";
import { Validators } from "@dhis2/d2-ui-forms";

import "./OrganisationUnitsStep.css";

/*
    HACK: Use css to hide all selector boxes in tree except for those of level 6.
    This way, we don't have to fork @dhis2/d2-ui:OrgUnitTree. This component has
    a prop hideCheckboxes, but it's an all or nothing bool (ideally, it should get a predicate).
*/

class OrganisationUnitsStep extends React.Component {
    static propTypes = {
        d2: PropTypes.object.isRequired,
        campaign: PropTypes.object.isRequired,
        onChange: PropTypes.func.isRequired,
    };

    controls = {
        filterByLevel: false,
        filterByGroup: false,
        selectAll: false,
    };

    setOrgUnits = orgUnitsPaths => {
        const orgUnits = orgUnitsPaths.map(path => ({
            id: _.last(path.split("/")),
            level: path.split("/").length - 1,
            path,
        }));
        const orgUnitsForAcceptedLevels = orgUnits.filter(ou =>
            this.props.campaign.selectableLevels.includes(ou.level)
        );
        const newCampaign = this.props.campaign.setOrganisationUnits(orgUnitsForAcceptedLevels);
        this.props.onChange(newCampaign);
    };

    onUpdateField = (fieldName, newValue) => {
        const { campaign, onChange } = this.props;
        if (fieldName === "teams") {
            const newCampaign = campaign.setTeams(parseInt(newValue));
            if (newCampaign) onChange(newCampaign);
        }
    };

    render() {
        const { d2, campaign } = this.props;
        const fields = [
            {
                name: "teams",
                value: campaign.teams ? campaign.teams.toString() : "",
                component: TextField,
                props: {
                    floatingLabelText: i18n.t("Number of Teams"),
                    style: { width: "33%" },
                    changeEvent: "onBlur",
                    "data-field": "teams",
                    type: "number",
                    min: 1,
                },
                validators: [
                    {
                        message: i18n.t("Field cannot be blank"),
                        validator(value) {
                            return Validators.isRequired(value);
                        },
                    },
                    {
                        message: i18n.t("Number of teams must be positive"),
                        validator(value) {
                            return Validators.isPositiveNumber(parseInt(value));
                        },
                    },
                ],
            },
        ];

        return (
            <React.Fragment>
                <FormBuilder
                    style={styles.formBuilder}
                    fields={fields}
                    onUpdateField={this.onUpdateField}
                />
                <OrgUnitsSelector
                    d2={d2}
                    onChange={this.setOrgUnits}
                    selected={campaign.organisationUnits.map(ou => ou.path)}
                    levels={campaign.selectableLevels}
                    controls={this.controls}
                />
            </React.Fragment>
        );
    }
}

const styles = {
    formBuilder: { marginBottom: 20 },
};

export default OrganisationUnitsStep;
