import React, { Component } from "react";
import PropTypes from "prop-types";
import { HeaderBar } from "@dhis2/ui";
import { MuiThemeProvider } from "@material-ui/core/styles";
import OldMuiThemeProvider from "material-ui/styles/MuiThemeProvider";
import { SnackbarProvider, LoadingProvider } from "@eyeseetea/d2-ui-components";
import _ from "lodash";

import { muiTheme } from "../../themes/dhis2.theme";
import muiThemeLegacy from "../../themes/dhis2-legacy.theme";
import "./App.css";
import Root from "./Root";
import Share from "../share/Share";
import DbD2 from "../../models/db-d2";
import { getMetadataConfig } from "../../models/config";
import { hasCurrentUserRoles } from "../../utils/permissions";
import { isTestEnv } from "../../utils/dhis2";

class App extends Component {
    static propTypes = {
        d2: PropTypes.object.isRequired,
        appConfig: PropTypes.object.isRequired,
        api: PropTypes.object.isRequired,
    };

    state = {
        config: null,
        db: null,
    };

    async componentDidMount() {
        const { d2, appConfig } = this.props;
        const appKey = _(this.props.appConfig).get("appKey");
        const db = new DbD2(d2);
        const config = await getMetadataConfig(db);
        window.config = config;
        const showFeedbackForCurrentUser = hasCurrentUserRoles(
            d2,
            config.userRoles,
            config.userRoleNames.feedback
        );

        if (appConfig && appConfig.feedback && showFeedbackForCurrentUser) {
            const feedbackOptions = {
                ...appConfig.feedback,
                i18nPath: "feedback-tool/i18n",
            };
            window.$.feedbackDhis2(d2, appKey, feedbackOptions);
        }

        this.setState({ config, db });
    }

    render() {
        const { d2, appConfig, api } = this.props;
        const { config, db } = this.state;
        const showShareButton = _(appConfig).get("appearance.showShareButton") || false;
        const showHeader = !isTestEnv();

        return (
            <React.Fragment>
                <MuiThemeProvider theme={muiTheme}>
                    <OldMuiThemeProvider muiTheme={muiThemeLegacy}>
                        <LoadingProvider>
                            {showHeader && <HeaderBar appName="" email="aa@a.com" />}

                            <div id="app" className="content">
                                <SnackbarProvider>
                                    {config && db && (
                                        <Root d2={d2} db={db} config={config} api={api} />
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

export default App;
