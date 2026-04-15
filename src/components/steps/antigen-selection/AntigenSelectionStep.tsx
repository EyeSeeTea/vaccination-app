import React from "react";
import _ from "lodash";
import { MultiSelector } from "@eyeseetea/d2-ui-components";

import Campaign, { Antigen } from "../../../models/campaign";

type AntigenSelectionStepProps = {
    campaign: Campaign;
    onChange: (campaign: Campaign) => void;
};

type AntigenSelectionStepState = {
    antigens: Antigen[] | null;
};

class AntigenSelectionStep extends React.Component<
    AntigenSelectionStepProps,
    AntigenSelectionStepState
> {
    state: AntigenSelectionStepState = { antigens: null };

    componentDidMount() {
        const { campaign } = this.props;
        const antigens = campaign.getAvailableAntigens();
        this.setState({ antigens });
    }

    onChange = (selected: string[]) => {
        const antigens = _(this.state.antigens).keyBy("code").at(selected).value();
        const newCampaign = this.props.campaign.setAntigens(antigens);
        this.props.onChange(newCampaign);
    };

    render() {
        const { campaign } = this.props;
        const { antigens } = this.state;

        if (!antigens) return null;

        const options = antigens.map(antigen => ({ value: antigen.code, text: antigen.name }));
        const selected = campaign.antigens.map(antigen => antigen.code);

        return (
            <div>
                <MultiSelector
                    height={300}
                    onChange={this.onChange}
                    options={options}
                    selected={selected}
                    ordered={true}
                />
            </div>
        );
    }
}

export default AntigenSelectionStep;
