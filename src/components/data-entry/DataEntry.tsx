/**
 * Render the data entry form to enter values for a campaign.
 *
 * We use the Aggregated DHIS2 Data App as plugin and our custom mode "app". So we may pass
 * the URL with dataSetId, orgUnitId and period as query parameters, but we also pass some
 * custom props to customize some of the UI elements of the plugin (like the dataset selector,
 * the tab section selector, etc).
 */
import React from "react";
import _ from "lodash";
import { Plugin, PluginProps } from "@dhis2/app-runtime/experimental";
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
import { OrganisationUnit } from "../../domain/entities/OrganisationUnit";

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
    organisationUnits: Maybe<OrganisationUnit[]>;
    restoredUrl: Maybe<string>;
};

class DataEntry extends React.Component<DataEntryProps, DataEntryState> {
    state: DataEntryState = {
        campaign: undefined,
        restoredUrl: undefined,
        organisationUnits: undefined,
    };

    styles = makeStyles({
        subtitle: { marginBottom: 10, marginLeft: 15 },
    });

    private iframeWindow: Window | null = null;

    getCampaignId = (): Maybe<string> => {
        return this.props.match.params.id;
    };

    async componentDidMount() {
        const { snackbar, compositionRoot } = this.props;
        const campaignId = this.getCampaignId();
        if (!campaignId) return;

        const storedUrl = localStorage.getItem(this.localStorageKey(campaignId));
        if (storedUrl) {
            console.debug(`Using stored iframe URL for campaign ${campaignId}: ${storedUrl}`);
            this.setState({ restoredUrl: storedUrl });
        }

        try {
            const campaign = await compositionRoot.campaigns.get.execute(campaignId);
            const orgUnitIdsForCampaign = campaign.data.organisationUnits.map(ou => ou.id);
            // Get campaign org units entities (which include ancestors) so we can order them
            // and select the first org unit with the same logic they are rendered in the selector.
            const campaignOrgUnits = await compositionRoot.organisationUnits.get.execute(
                orgUnitIdsForCampaign
            );
            const organisationUnitsSorted = _.sortBy(campaignOrgUnits, ou =>
                ou.getFullOrgUnitName()
            );

            this.setState({
                campaign: campaign,
                organisationUnits: organisationUnitsSorted,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            snackbar.error(message);
        }
    }

    componentWillUnmount() {
        this.iframeWindow?.removeEventListener("hashchange", this.onIframeHashChange);
    }

    localStorageKey(campaignId: string): string {
        return `vaccination-app.data-entry.${campaignId}`;
    }

    saveIframeUrl = (url: string) => {
        const campaignId = this.getCampaignId();
        if (campaignId) {
            const key = this.localStorageKey(campaignId);
            const oldValue = localStorage.getItem(key);
            if (oldValue !== url) {
                console.debug(`Saving iframe URL for campaign ${campaignId}: ${url}`);
                localStorage.setItem(key, url);
            }
        }
    };

    onIframeLoad: React.ReactEventHandler<HTMLIFrameElement> = event => {
        const win = event.currentTarget.contentWindow;
        if (!win) return;

        this.iframeWindow?.removeEventListener("hashchange", this.onIframeHashChange);
        this.iframeWindow = win;
        win.addEventListener("hashchange", this.onIframeHashChange);
        this.saveIframeUrl(win.location.href);
    };

    onIframeHashChange = () => {
        if (this.iframeWindow) this.saveIframeUrl(this.iframeWindow.location.href);
    };

    getDataEntryUrl = (): Maybe<string> => {
        const campaignId = this.getCampaignId();
        const { campaign, organisationUnits } = this.state;
        const { routes } = this.props;

        if (campaign) {
            return routes.getDataEntryUrl({
                campaignId: assert(campaign.id, "Campaign ID is required"),
                orgUnitId: organisationUnits?.[0]?.id,
                period: campaign.startDate || undefined,
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
        const dataEntryUrl = this.state.restoredUrl || this.getDataEntryUrl();

        const help =
            i18n.t(`Select a) site where vaccination was performed, b) Reactive vaccination data set available at site level c) date of vaccination d) team that performed vaccination.

        Then enter data for the fields shown in the screen.`);
        const subtitle = i18n.t(
            `Please make sure all information is provided and there are no blank fields. Blank fields will be interpreted as missing information, as opposed to 0.
Once cells turn into green, all information is saved and you can leave the Data Entry Section`
        );

        const { campaign } = this.state;

        const titleWithCampaign = [
            i18n.t("Data Entry"),
            campaign ? ` - ${campaign.name}` : "",
        ].join("");

        const dataEntryProps: PluginProps = {
            ...dataEntryBaseProps,
            hideDataSetSelector: Boolean(campaign),
        };

        return (
            <>
                <PageHeader
                    title={titleWithCampaign}
                    help={help}
                    onBackClick={this.backCampaignConfiguration}
                    pageVisited={pageVisited}
                />

                <div style={this.styles.subtitle}>{subtitle}</div>

                <div>
                    {dataEntryUrl ? (
                        <Plugin
                            width="100%"
                            height="650"
                            pluginSource={dataEntryUrl}
                            showAlertsInPlugin={true}
                            onLoad={this.onIframeLoad}
                            {...dataEntryProps}
                        />
                    ) : (
                        <LinearProgress />
                    )}
                </div>
            </>
        );
    }
}

const dataEntryBaseProps: PluginProps = {
    mode: "app",
    hideDataSetSelector: true,
    hideTabSectionSelector: true,
    hideClearSelectionsButton: true,
    hideFilterField: true,
};

export default withSnackbar(withPageVisited(DataEntry, "data-entry"));
