import React from "react";
import _ from "lodash";
import i18n from "@dhis2/d2-i18n";
import { OrgUnitsSelector, withSnackbar, SnackbarState } from "@eyeseetea/d2-ui-components";
import { FormBuilder } from "@dhis2/d2-ui-forms";
import { TextField } from "@dhis2/d2-ui-core";
import { Validators } from "@dhis2/d2-ui-forms";

import { D2 } from "../../../models/d2.types";
import { D2Api } from "../../../types/d2-api";
import Campaign from "../../../models/campaign";
import { getCurrentUserDataViewOrganisationUnits } from "../../../utils/dhis2";
import { makeStyles } from "../../../utils/react";

/*
    HACK: Use css to hide all selector boxes in tree except for those of level 6.
    This way, we don't have to fork @dhis2/d2-ui:OrgUnitTree. This component has
    a prop hideCheckboxes, but it's an all or nothing bool (ideally, it should get a predicate).
*/

type OrganisationUnitsStepProps = {
    d2: D2;
    api: D2Api;
    campaign: Campaign;
    onChange: (campaign: Campaign) => void;
    snackbar: SnackbarState;
};

class OrganisationUnitsStep extends React.Component<OrganisationUnitsStepProps> {
    listParams = { maxLevel: 6 };

    controls = {
        filterByLevel: false,
        filterByGroup: false,
        selectAll: false,
    };

    rootIds: string[];

    constructor(props: OrganisationUnitsStepProps) {
        super(props);
        const orgUnitIds = getCurrentUserDataViewOrganisationUnits(this.props.d2);
        this.rootIds = orgUnitIds;
    }

    componentDidMount() {
        if (_(this.rootIds).isEmpty()) {
            this.props.snackbar.error(
                i18n.t("This user has no Data output and analytic organisation units assigned")
            );
        }
    }

    setOrgUnits = (orgUnitsPaths: string[]) => {
        const orgUnits = orgUnitsPaths.map(path => ({
            id: _.last(path.split("/")) || "",
            level: path.split("/").length - 1,
            path,
        }));
        const orgUnitsForAcceptedLevels = orgUnits.filter(ou =>
            this.props.campaign.selectableLevels.includes(ou.level)
        );
        const newCampaign = this.props.campaign.setOrganisationUnits(orgUnitsForAcceptedLevels);
        this.props.onChange(newCampaign);
    };

    onUpdateField = (fieldName: string, newValue: string) => {
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
                        validator(value: string) {
                            return Validators.isRequired(value);
                        },
                    },
                    {
                        message: i18n.t("Number of teams must be positive"),
                        validator(value: string) {
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
                    api={this.props.api}
                    onChange={this.setOrgUnits}
                    selected={campaign.organisationUnits.map(ou => ou.path)}
                    selectableLevels={campaign.selectableLevels}
                    controls={this.controls}
                    rootIds={this.rootIds}
                    listParams={this.listParams}
                />
            </React.Fragment>
        );
    }
}

const styles = makeStyles({
    formBuilder: { marginBottom: 20 },
});

export default withSnackbar(OrganisationUnitsStep);
