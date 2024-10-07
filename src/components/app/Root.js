import React from "react";
import PropTypes from "prop-types";
import { Switch, Route } from "react-router-dom";
import i18n from "@dhis2/d2-i18n";

import CampaignConfiguration from "../campaign-configuration/CampaignConfiguration";
import DataEntry from "../data-entry/DataEntry";
import Dashboard from "../dashboard/Dashboard";
import LandingPage from "./LandingPage";
import CampaignWizard from "../campaign-wizard/CampaignWizard";

class Root extends React.Component {
    static propTypes = {
        d2: PropTypes.object.isRequired,
        db: PropTypes.object.isRequired,
    };

    render() {
        const { d2, config, db, api } = this.props;
        const base = { d2, config, db, api };
        i18n.setDefaultNamespace("vaccination-app");
        if (!config) return null;

        return (
            <Switch>
                <Route
                    path="/campaign-configuration/new"
                    render={props => <CampaignWizard {...base} {...props} />}
                />

                <Route
                    path="/campaign-configuration/edit/:id"
                    render={props => <CampaignWizard {...base} {...props} />}
                />

                <Route
                    path="/campaign-configuration"
                    render={props => <CampaignConfiguration {...base} {...props} />}
                />

                <Route
                    path="/data-entry/:id?"
                    render={props => <DataEntry {...base} {...props} />}
                />

                <Route
                    path="/dashboard/:id?"
                    render={props => <Dashboard {...base} {...props} />}
                />

                <Route render={() => <LandingPage d2={d2} />} />
            </Switch>
        );
    }
}

export default Root;
