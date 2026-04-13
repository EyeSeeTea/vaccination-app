import React from "react";
import PropTypes from "prop-types";
import i18n from "@dhis2/d2-i18n";
import _ from "lodash";
import { Card, CardContent } from "@material-ui/core";
// @ts-ignore
import { TextField } from "@dhis2/d2-ui-core";
// @ts-ignore
import { FormBuilder } from "@dhis2/d2-ui-forms";
// @ts-ignore
import { Validators } from "@dhis2/d2-ui-forms";

import { DatePicker } from "@eyeseetea/d2-ui-components";
import { translateError } from "../../../utils/validations";
import { D2 } from "../../../models/d2.types";
import Campaign from "../../../models/campaign";

type GeneralInfoStepProps = {
    d2: D2;
    campaign: Campaign;
    onChange: (campaign: Campaign) => void;
};

type GeneralInfoStepState = {
    orgUnitNames: string[] | null;
};

class GeneralInfoStep extends React.Component<GeneralInfoStepProps, GeneralInfoStepState> {
    state: GeneralInfoStepState = {
        orgUnitNames: null,
    };

    static propTypes = {
        d2: PropTypes.object.isRequired,
        campaign: PropTypes.object.isRequired,
        onChange: PropTypes.func.isRequired,
    };

    validateCampaignName = async (name: string) => {
        const { campaign } = this.props;
        const errors = await campaign.setName(name).validateName();

        if (!_.isEmpty(errors)) {
            throw errors.map(translateError).join(", ");
        }
    };

    render() {
        const { campaign, onChange } = this.props;

        const fields = [
            {
                name: "name",
                value: campaign.name,
                component: TextField,
                props: {
                    floatingLabelText: i18n.t("Name"),
                    style: { width: "33%" },
                    changeEvent: "onBlur",
                    "data-field": "name",
                    onBlur: (ev: React.FocusEvent<HTMLInputElement>) => {
                        return onChange(campaign.setName(ev.target.value));
                    },
                },
                validators: [
                    {
                        message: i18n.t("Field cannot be blank"),
                        validator: Validators.isRequired,
                    },
                ],
                asyncValidators: [this.validateCampaignName],
            },
            {
                name: "description",
                value: campaign.description,
                component: TextField,
                props: {
                    floatingLabelText: i18n.t("Description"),
                    style: { width: "33%" },
                    changeEvent: "onBlur",
                    "data-field": "description",
                    multiLine: true,
                    onBlur: (ev: React.FocusEvent<HTMLInputElement>) => {
                        onChange(campaign.setDescription(ev.target.value));
                    },
                },
            },
            {
                name: "startDate",
                value: campaign.startDate,
                component: DatePicker,
                props: {
                    label: i18n.t("Start Date"),
                    value: campaign.startDate,
                    onChange: (value: Date) => onChange(campaign.setStartDate(value)),
                },
            },
            {
                name: "endDate",
                value: campaign.endDate,
                component: DatePicker,
                props: {
                    label: i18n.t("End Date"),
                    value: campaign.endDate,
                    onChange: (value: Date) => onChange(campaign.setEndDate(value)),
                },
            },
        ];

        return (
            <Card>
                <CardContent>
                    <FormBuilder fields={fields} onUpdateField={_.noop} />
                </CardContent>
            </Card>
        );
    }
}

export default GeneralInfoStep;
