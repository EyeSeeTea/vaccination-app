import React from "react";
import i18n from "@dhis2/d2-i18n";
import {
    withSnackbar,
    withLoading,
    SnackbarState,
    LoadingState,
} from "@eyeseetea/d2-ui-components";
import ReactDOM from "react-dom";

import PageHeader from "../shared/PageHeader";
import { LinearProgress } from "@material-ui/core";
import { withPageVisited } from "../utils/page-visited-app";
import { MetadataConfig } from "../../models/config";
import { CompositionRoot } from "../../CompositionRoot";
import DbD2 from "../../models/db-d2";
import { Maybe } from "../../models/db.types";
import { makeStyles } from "../../utils/react";
import { Routes } from "../app/Routes";

type DashboardOwnProps = {
    config: MetadataConfig;
    routes: Routes;
    compositionRoot: CompositionRoot;
    db: DbD2;
    pageVisited: Maybe<boolean>;
};

type RouteParams = {
    id?: string;
};

type DashboardProps = DashboardOwnProps & {
    snackbar: SnackbarState;
    loading: LoadingState;
    match: { params: RouteParams };
    history: { push: (path: string) => void };
};

type DashboardState = {
    iFrameSrc: string;
    isGenerating: boolean;
};

class Dashboard extends React.Component<DashboardProps, DashboardState> {
    state: DashboardState = {
        iFrameSrc: "",
        isGenerating: false,
    };

    async componentDidMount() {
        const { match, snackbar, loading } = this.props;
        const dataSetId = match.params.id;

        try {
            if (!dataSetId) throw new Error("No dataset ID provided");
            const dashboardURL = await this.getDashboardURL(dataSetId);
            this.setState({ iFrameSrc: dashboardURL || "" }, () => {
                const { iFrameSrc } = this.state;
                if (iFrameSrc) {
                    // eslint-disable-next-line react/no-find-dom-node
                    const iframe = ReactDOM.findDOMNode(this.refs.iframe) as HTMLIFrameElement;
                    iframe.addEventListener(
                        "load",
                        this.setDashboardStyling.bind(this, iframe, dataSetId)
                    );
                }
            });
        } catch (err) {
            loading.hide();
            const message = err instanceof Error ? err.message : String(err);
            snackbar.error(message);
            this.backCampaignConfiguration();
        }
    }

    waitforElementToLoad(iframeDocument: Document, selector: string) {
        return new Promise<void>(resolve => {
            const check = () => {
                if (iframeDocument.querySelector(selector)) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };

            check();
        });
    }

    async setDashboardStyling(iframe: HTMLIFrameElement, dataSetId: string) {
        if (!iframe.contentWindow) return;
        const iframeDocument = iframe.contentWindow.document;
        await this.waitforElementToLoad(iframeDocument, "[data-test='title-bar']");
        remove(iframeDocument, "header");

        if (dataSetId) {
            remove(iframeDocument, "[data-test='dashboards-bar']");
            remove(iframeDocument, "[data-test='title-bar'] > div > div > span");
            remove(iframeDocument, "[data-test='title-bar'] > div > div > div");

            iframeDocument.querySelectorAll("a").forEach(link => {
                link.setAttribute("target", "_blank");
            });
        }
    }

    backCampaignConfiguration = () => {
        const {
            match: { params },
        } = this.props;
        if (params.id) {
            this.props.history.push("/campaign-configuration");
        } else {
            this.props.history.push("/");
        }
    };

    async getDashboardURL(dataSetId: string) {
        const { snackbar, loading, compositionRoot } = this.props;

        const campaign = await compositionRoot.campaigns.get.execute(dataSetId);

        let dashboardId: Maybe<string>;
        if (campaign.dashboardId) {
            dashboardId = campaign.dashboardId;
        } else {
            loading.show(
                true,
                i18n.t(
                    "It looks like it's the first time you are accessing the dashboard for this campaign. Generating dashboard. This may take up to a couple of minutes"
                )
            );
            this.setState({ isGenerating: true });
            dashboardId = await campaign.createDashboard();
            loading.hide();
            this.setState({ isGenerating: false });
        }

        if (dashboardId) {
            return this.props.routes.getDashboardUrl({ id: dashboardId });
        } else {
            const msg = i18n.t("No dashboards associated with this campaign");
            snackbar.error(msg);
        }
    }

    render() {
        const { iFrameSrc, isGenerating } = this.state;
        const { pageVisited } = this.props;
        const help = i18n.t(
            "Please click on the grey arrow next to the chart/table title if you want to modify the layout."
        );

        return (
            <React.Fragment>
                <PageHeader
                    title={i18n.t("Dashboard")}
                    onBackClick={this.backCampaignConfiguration}
                    help={help}
                    pageVisited={pageVisited}
                />
                <div>
                    {iFrameSrc ? (
                        <iframe
                            ref="iframe"
                            title={i18n.t("Dashboard")}
                            src={iFrameSrc}
                            style={iframeStyles.iframe}
                        />
                    ) : (
                        !isGenerating && <LinearProgress />
                    )}
                </div>
            </React.Fragment>
        );
    }
}

const iframeStyles = makeStyles({
    iframe: { width: "100%", height: "calc(100vh - 140px)" },
});

function remove(document: Document, selector: string) {
    const el = document.querySelector(selector);
    if (el) el.remove();
}

export default withLoading(withSnackbar(withPageVisited(Dashboard, "dashboard")));
