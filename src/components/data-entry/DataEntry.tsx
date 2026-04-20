import React from "react";
import i18n from "@dhis2/d2-i18n";
import { withSnackbar, SnackbarState } from "@eyeseetea/d2-ui-components";

import PageHeader from "../shared/PageHeader";
import { LinearProgress } from "@material-ui/core";
import { withPageVisited } from "../utils/page-visited-app";
import { Maybe } from "../../models/db.types";
import { makeStyles } from "../../utils/react";
import { assert } from "../../utils/assert";
import { CompositionRoot } from "../../CompositionRoot";
import { Routes } from "../app/Routes";
import Campaign from "../../models/campaign";

type DataEntryOwnProps = {
    compositionRoot: CompositionRoot;
    routes: Routes;
    pageVisited: Maybe<boolean>;
};

type RouteParams = {
    id?: string;
};

type DataEntryProps = DataEntryOwnProps & {
    snackbar: SnackbarState;
    match: { params: RouteParams };
    history: { push: (path: string) => void };
};

type DataEntryState = {
    campaign: Maybe<Campaign>;
};

class DataEntry extends React.Component<DataEntryProps, DataEntryState> {
    state: DataEntryState = {
        campaign: undefined,
    };

    private iframeRef = React.createRef<HTMLIFrameElement>();

    styles = makeStyles({
        subtitle: { marginBottom: 10, marginLeft: 15 },
    });

    getCampaignId = (): Maybe<string> => {
        return this.props.match.params.id;
    };

    async componentDidMount() {
        const campaignId = this.getCampaignId();
        if (!campaignId) return;

        try {
            const campaign = await this.props.compositionRoot.campaigns.get.execute(campaignId);
            this.setState({ campaign });
        } catch (error) {
            this.props.snackbar.error(i18n.t("No datasets associated with this campaign"));
        }
    }

    onIframeLoad = () => {
        const iframeDoc = this.iframeRef.current?.contentDocument;
        if (!iframeDoc) return;

        const campaignId = this.getCampaignId();
        const style = iframeDoc.createElement("style");
        style.textContent = getIframeCssOverrides({ hasCampaign: !!campaignId });
        iframeDoc.head.appendChild(style);
    };

    getDataEntryUrl = (): Maybe<string> => {
        const campaignId = this.getCampaignId();
        const { campaign } = this.state;
        const { routes } = this.props;

        if (campaign) {
            return routes.getDataEntryUrl({
                campaignId: assert(campaign.id, "Campaign ID is required"),
                orgUnitId: campaign.organisationUnits[0]?.id,
                period: campaign.startDate ?? undefined,
            });
        } else if (!campaignId) {
            return routes.getDataEntryUrl({
                campaignId: undefined,
                orgUnitId: undefined,
                period: undefined,
            });
        } else {
            return undefined;
        }
    };

    backCampaignConfiguration = () => {
        const campaignId = this.getCampaignId();

        if (campaignId) {
            this.props.history.push("/campaign-configuration");
        } else {
            this.props.history.push("/");
        }
    };

    render() {
        const { pageVisited } = this.props;
        const dataEntryUrl = this.getDataEntryUrl();

        const help =
            i18n.t(`Select a) site where vaccination was performed, b) Reactive vaccination data set available at site level c) date of vaccination d) team that performed vaccination.

        Then enter data for the fields shown in the screen.`);
        const subtitle = i18n.t(
            `Please make sure all information is provided and there are no blank fields. Blank fields will be interpreted as missing information, as opposed to 0.
Once cells turn into green, all information is saved and you can leave the Data Entry Section`
        );

        return (
            <>
                <PageHeader
                    title={i18n.t("Data Entry")}
                    help={help}
                    onBackClick={this.backCampaignConfiguration}
                    pageVisited={pageVisited}
                />

                <div style={this.styles.subtitle}>{subtitle}</div>

                <div>
                    {dataEntryUrl ? (
                        <iframe
                            ref={this.iframeRef}
                            title={i18n.t("Data Entry")}
                            src={dataEntryUrl}
                            style={iframeStyles.iframe}
                            onLoad={this.onIframeLoad}
                        />
                    ) : (
                        <LinearProgress />
                    )}
                </div>
            </>
        );
    }
}

function hide(cssSelector: string, options?: { if: boolean }): string {
    const ifCondition = options?.if ?? true;
    return ifCondition ? `${cssSelector} { display: none !important; }` : "";
}

function getIframeCssOverrides(options: { hasCampaign: boolean }): string {
    return [
        /* Hide the DHIS2 header bar */
        hide("div.app-shell-adapter > div:first-child"),

        /* Hide the Section selector (tab selector) */
        hide(`[data-test="section-filter-selector"]`),

        /* Hide the Options selector (contains Help button) */
        hide(`.additional-contents`),

        /* Hide the "Clear selections" button (when data set is not shown, it'd then impossible to set) */
        hide(`.clear-selections`),

        /* Hide the data-set selector when the component targets a specific campaign */
        hide(`[data-test="data-set-selector"]`, { if: options.hasCampaign }),
    ].join("\n");
}

const iframeStyles = makeStyles({
    iframe: { width: "100%", height: 1000, border: "none" },
});

export default withSnackbar(withPageVisited(DataEntry, "data-entry"));
