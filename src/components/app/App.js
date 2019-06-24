import React, { Component } from "react";
import PropTypes from "prop-types";
import HeaderBar from "@dhis2/d2-ui-header-bar";
import { MuiThemeProvider } from "@material-ui/core/styles";
import JssProvider from "react-jss/lib/JssProvider";
import { createGenerateClassName } from "@material-ui/core/styles";
import OldMuiThemeProvider from "material-ui/styles/MuiThemeProvider";
import { SnackbarProvider, LoadingProvider } from "d2-ui-components";
import _ from "lodash";

import { muiTheme } from "../../themes/dhis2.theme";
import muiThemeLegacy from "../../themes/dhis2-legacy.theme";
import "./App.css";
import Root from "./Root";
import Share from "../share/Share";
import { getCurrentUserRoles } from "../../utils/dhis2";
import DbD2 from "../../models/db-d2";
import { getMetadataConfig } from "../../models/config";

const generateClassName = createGenerateClassName({
    dangerouslyUseGlobalCSS: false,
    productionPrefix: "c",
});

class App extends Component {
    static propTypes = {
        d2: PropTypes.object.isRequired,
        appConfig: PropTypes.object.isRequired,
    };

    state = {
        config: null,
    };

    async componentDidMount() {
        const { d2, appConfig } = this.props;
        const appKey = _(this.props.appConfig).get("appKey");
        const currentUserRoles = getCurrentUserRoles(d2);
        const config = await getMetadataConfig(new DbD2(d2));
        const userRoleForFeedback = _(config.userRoles)
            .keyBy("name")
            .getOrFail(config.userRoleNameForFeedback);
        const showFeedbackForCurrentUser = _(currentUserRoles).includes(userRoleForFeedback.id);

        if (appConfig && appConfig.feedback && showFeedbackForCurrentUser) {
            const feedbackOptions = {
                ...appConfig.feedback,
                i18nPath: "feedback-tool/i18n",
            };
            window.$.feedbackDhis2(d2, appKey, feedbackOptions);
        }

        this.setState({ config });
    }

    render() {
        const { d2, appConfig } = this.props;
        const { config } = this.state;
        const showShareButton = _(appConfig).get("appearance.showShareButton") || false;
        const showHeader = !process.env.REACT_APP_CYPRESS;

        return (
            <React.Fragment>
                <JssProvider generateClassName={generateClassName}>
                    <MuiThemeProvider theme={muiTheme}>
                        <OldMuiThemeProvider muiTheme={muiThemeLegacy}>
                            <LoadingProvider>
                                {showHeader && <HeaderBar d2={d2} />}

                                <div id="app" className="content">
                                    <SnackbarProvider>
                                        {config && <Root d2={d2} config={config} />}
                                    </SnackbarProvider>
                                </div>

                                <Share visible={showShareButton} />
                            </LoadingProvider>
                        </OldMuiThemeProvider>
                    </MuiThemeProvider>
                </JssProvider>
            </React.Fragment>
        );
    }
}

export default App;
