import React, { Component } from "react";
import { HeaderBar } from "@dhis2/ui";
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
import { isTestEnv } from "../../utils/dhis2";
import { CompositionRoot, getCompositionRoot } from "../../CompositionRoot";
import { D2Api } from "../../types/d2-api";
import { D2 } from "../../models/d2.types";
import { Routes } from "./Routes";

type AppProps = {
    d2: D2;
    appConfig: AppConfig;
    api: D2Api;
};

type AppState = {
    config: MetadataConfig | null;
    db: DbD2 | null;
    compositionRoot: CompositionRoot | null;
};

class App extends Component<AppProps, AppState> {
    state: AppState = {
        config: null,
        db: null,
        compositionRoot: null,
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

        this.setState({ config, db, compositionRoot });
    }

    render() {
        const { d2, appConfig, api } = this.props;
        const { config, db, compositionRoot } = this.state;
        const showShareButton = _(appConfig).get("appearance.showShareButton") || false;
        const showHeader = !isTestEnv();
        const routes = new Routes(api.baseUrl);

        return (
            <React.Fragment>
                <MuiThemeProvider theme={muiTheme}>
                    <OldMuiThemeProvider muiTheme={muiThemeLegacy}>
                        <LoadingProvider>
                            {showHeader && <HeaderBar appName="" email="aa@a.com" />}

                            <div id="app" className="content">
                                <SnackbarProvider>
                                    {config && db && compositionRoot && (
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
