import React from "react";
import { Switch, Route } from "react-router-dom";
import i18n from "@dhis2/d2-i18n";

import CampaignConfiguration from "../campaign-configuration/CampaignConfiguration";
import DataEntry from "../data-entry/DataEntry";
import Dashboard from "../dashboard/Dashboard";
import LandingPage from "./LandingPage";
import CampaignWizard from "../campaign-wizard/CampaignWizard";
import { D2 } from "../../models/d2.types";
import { D2Api } from "../../types/d2-api";
import { MetadataConfig } from "../../models/config";
import { CompositionRoot } from "../../CompositionRoot";
import DbD2 from "../../models/db-d2";
import { Routes } from "./Routes";

type RootProps = {
    d2: D2;
    routes: Routes;
    db: DbD2;
    api: D2Api;
    config: MetadataConfig;
    compositionRoot: CompositionRoot;
};

class Root extends React.Component<RootProps> {
    render() {
        const base = this.props;
        i18n.setDefaultNamespace("vaccination-app");
        if (!this.props.config) return null;

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

                <Route render={() => <LandingPage_ d2={this.props.d2} />} />
            </Switch>
        );
    }
}

const LandingPage_ = LandingPage as unknown as React.ComponentType<{
    d2: D2;
}>;

export default Root;
