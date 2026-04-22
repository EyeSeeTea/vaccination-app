import React from "react";
import i18n from "@dhis2/d2-i18n";
import {
    withSnackbar,
    withLoading,
    SnackbarState,
    LoadingState,
} from "@eyeseetea/d2-ui-components";

import PageHeader from "../shared/PageHeader";
import { LinearProgress } from "@material-ui/core";
import { withPageVisited } from "../utils/page-visited-app";
import { MetadataConfig } from "../../models/config";
import { CompositionRoot } from "../../CompositionRoot";
import DbD2 from "../../models/db-d2";
import { Maybe } from "../../models/db.types";
import { makeStyles } from "../../utils/react";
import { Routes } from "../app/Routes";
import Campaign from "../../models/campaign";

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
    campaign: Maybe<Campaign>;
};

class Dashboard extends React.Component<DashboardProps, DashboardState> {
    state: DashboardState = {
        iFrameSrc: "",
        isGenerating: false,
        campaign: undefined,
    };

    private iframeRef = React.createRef<HTMLIFrameElement>();

    async componentDidMount() {
        const { match, snackbar, loading } = this.props;
        const campaignId = match.params.id;

        try {
            const campaign = campaignId
                ? await this.props.compositionRoot.campaigns.get.execute(campaignId)
                : undefined;
            const dashboardURL = await this.getDashboardURL({ campaign: campaign });
            if (dashboardURL) this.setState({ iFrameSrc: dashboardURL, campaign: campaign });
        } catch (err) {
            loading.hide();
            const message = err instanceof Error ? err.message : String(err);
            snackbar.error(message);
            this.backCampaignConfiguration();
        }
    }

    onIframeLoad = () => {
        const iframeDoc = this.iframeRef.current?.contentDocument;
        if (!iframeDoc) return;

        const campaignId = this.props.match.params.id;
        const style = iframeDoc.createElement("style");

        style.textContent = getIframeCssOverrides({ forCampaign: !!campaignId });
        iframeDoc.head.appendChild(style);
    };

    backCampaignConfiguration = () => {
        const campaignId = this.props.match.params.id;

        if (campaignId) {
            this.props.history.push("/campaign-configuration");
        } else {
            this.props.history.push("/");
        }
    };

    async getDashboardURL(options: { campaign: Maybe<Campaign> }): Promise<Maybe<string>> {
        const { snackbar, loading } = this.props;
        const { campaign } = options;

        if (!campaign) {
            return this.props.routes.getDashboardUrl({ dashboardId: undefined });
        }

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
            return this.props.routes.getDashboardUrl({ dashboardId: dashboardId });
        } else {
            const msg = i18n.t("No dashboards associated with this campaign");
            snackbar.error(msg);
        }
    }

    render() {
        const { campaign, iFrameSrc, isGenerating } = this.state;
        const { pageVisited } = this.props;
        const help = i18n.t(
            "Please click on the grey arrow next to the chart/table title if you want to modify the layout."
        );
        const titleWithCampaignName = [
            i18n.t("Dashboard"),
            campaign ? ` - ${campaign.name}` : "",
        ].join("");

        return (
            <React.Fragment>
                <PageHeader
                    title={titleWithCampaignName}
                    onBackClick={this.backCampaignConfiguration}
                    help={help}
                    pageVisited={pageVisited}
                />
                <div>
                    {iFrameSrc ? (
                        <iframe
                            ref={this.iframeRef}
                            title={i18n.t("Dashboard")}
                            src={iFrameSrc}
                            style={iframeStyles.iframe}
                            onLoad={this.onIframeLoad}
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

function hide(cssSelector: string, options?: { if: boolean }): string {
    const condition = options?.if ?? true;
    return condition ? `${cssSelector} { display: none !important; }` : "";
}

function getIframeCssOverrides(options: { forCampaign: boolean }): string {
    const sections = {
        header: "header",
        dashboardsBar: `[class*='creationNavigationBlock']`,
    };

    return [
        hide(sections.header),
        hide(sections.dashboardsBar, { if: options.forCampaign }),
        // Since we hide the dashboardsBar, we need to add some margin to the top bar
        `[class*='_container_'] { margin-top: 5px; margin-bottom: 5px; }`,
    ].join("\n");
}

export default withLoading(withSnackbar(withPageVisited(Dashboard, "dashboard")));
