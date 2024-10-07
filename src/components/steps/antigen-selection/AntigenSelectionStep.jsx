import React from "react";
import PropTypes from "prop-types";
import _ from "lodash";
import { MultiSelector } from "@eyeseetea/d2-ui-components";

class AntigenSelectionStep extends React.Component {
    state = { antigens: null };

    static propTypes = {
        d2: PropTypes.object.isRequired,
        campaign: PropTypes.object.isRequired,
        onChange: PropTypes.func.isRequired,
    };

    async componentDidMount() {
        const { campaign } = this.props;
        const antigens = await campaign.getAvailableAntigens();
        this.setState({ antigens });
    }

    onChange = selected => {
        const antigens = _(this.state.antigens).keyBy("code").at(selected).value();
        const newCampaign = this.props.campaign.setAntigens(antigens);
        this.props.onChange(newCampaign);
    };

    render() {
        const { d2, campaign } = this.props;
        const { antigens } = this.state;

        if (!antigens) return null;

        const options = antigens.map(antigen => ({ value: antigen.code, text: antigen.name }));
        const selected = campaign.antigens.map(antigen => antigen.code);

        return (
            <div>
                <MultiSelector
                    d2={d2}
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
