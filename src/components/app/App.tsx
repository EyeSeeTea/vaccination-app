import React, { Component } from "react";
import { MuiThemeProvider } from "@material-ui/core/styles";
// @ts-ignore
import OldMuiThemeProvider from "material-ui/styles/MuiThemeProvider";
import { SnackbarProvider, LoadingProvider } from "@eyeseetea/d2-ui-components";
import _ from "lodash";

import { muiTheme } from "../../themes/dhis2.theme";
import muiThemeLegacy from "../../themes/dhis2-legacy.theme";
import "./App.css";
import Root from "./Root";
import Share from "../share/Share";
import DbD2 from "../../models/db-d2";
import { getMetadataConfig, MetadataConfig } from "../../models/config";
import { hasCurrentUserRoles } from "../../utils/permissions";
import { CompositionRoot, getCompositionRoot } from "../../CompositionRoot";
import { D2Api } from "../../types/d2-api";
import { D2 } from "../../models/d2.types";
import { Routes } from "./Routes";
import { HeaderBar } from "./HeaderBar";

type AppProps = {
    d2: D2;
    appConfig: AppConfig;
    api: D2Api;
};

type AppState = {
    config: MetadataConfig | null;
    db: DbD2 | null;
    compositionRoot: CompositionRoot | null;
    routes: Routes | null;
};

class App extends Component<AppProps, AppState> {
    state: AppState = {
        config: null,
        db: null,
        compositionRoot: null,
        routes: null,
    };

    async componentDidMount() {
        const { d2, api, appConfig } = this.props;
        const db = new DbD2(d2, api);
        const config = await getMetadataConfig(db);
        const compositionRoot = getCompositionRoot({ db, api, config });
        Object.assign(window, { api, config, db, compositionRoot });

        const showFeedbackForCurrentUser = hasCurrentUserRoles(
            config.currentUser.userRoleIds,
            config.userRoles,
            config.userRoleNames.feedback
        );

        if (appConfig && appConfig.feedback && showFeedbackForCurrentUser) {
            // No feedback tool currently used, keep if we re-enable it in the future
        }

        const routes = new Routes(api.baseUrl, config);

        this.setState({ config, db, compositionRoot, routes });
    }

    render() {
        const { d2, appConfig, api } = this.props;
        const { config, db, compositionRoot, routes } = this.state;
        const showShareButton = _(appConfig).get("appearance.showShareButton") || false;

        return (
            <React.Fragment>
                <MuiThemeProvider theme={muiTheme}>
                    <OldMuiThemeProvider muiTheme={muiThemeLegacy}>
                        <LoadingProvider>
                            <HeaderBar appName="vaccination-app" />

                            <div id="app" className="content">
                                <SnackbarProvider>
                                    {config && db && compositionRoot && routes && (
                                        <Root
                                            d2={d2}
                                            db={db}
                                            config={config}
                                            api={api}
                                            routes={routes}
                                            compositionRoot={compositionRoot}
                                        />
                                    )}
                                </SnackbarProvider>
                            </div>

                            <Share visible={showShareButton} />
                        </LoadingProvider>
                    </OldMuiThemeProvider>
                </MuiThemeProvider>
            </React.Fragment>
        );
    }
}

declare global {
    interface Window {
        config: MetadataConfig;
        db: DbD2;
        compositionRoot: CompositionRoot;
    }
}

type AppConfig = {
    appKey: string;
    appearance: {
        showShareButton?: boolean;
    };
    feedback: {
        token: [string, string];
        createIssue: boolean;
        sendToDhis2UserGroups: string[];
        issues: {
            repository: string;
            title: string;
            body: string;
        };
        snapshots: {
            repository: string;
            branch: string;
        };
        feedbackOptions: Record<string, unknown>;
    } | null;
};

export default App;
