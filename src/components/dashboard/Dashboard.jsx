import React from "react";
import PropTypes from "prop-types";
import i18n from "@dhis2/d2-i18n";
import { withSnackbar, withLoading } from "@eyeseetea/d2-ui-components";
import ReactDOM from "react-dom";

import PageHeader from "../shared/PageHeader";
import { getDatasetById } from "../../models/datasets";
import { getDhis2Url } from "../../utils/routes";
import Campaign from "../../models/campaign";
import { LinearProgress } from "@material-ui/core";
import { withPageVisited } from "../utils/page-visited-app";

class Dashboard extends React.Component {
    static propTypes = {
        d2: PropTypes.object.isRequired,
        config: PropTypes.object.isRequired,
        db: PropTypes.object.isRequired,
        pageVisited: PropTypes.bool,
    };

    state = {
        iFrameSrc: "",
        isGenerating: false,
    };

    async componentDidMount() {
        const {
            d2,
            match: { params },
            config,
            snackbar,
            loading,
        } = this.props;
        const dataSetId = params.id;

        try {
            const dashboardURL = await this.getDashboardURL(dataSetId, config, d2);
            this.setState({ iFrameSrc: dashboardURL }, () => {
                const { iFrameSrc } = this.state;
                if (iFrameSrc) {
                    const iframe = ReactDOM.findDOMNode(this.refs.iframe);
                    iframe.addEventListener(
                        "load",
                        this.setDashboardStyling.bind(this, iframe, dataSetId)
                    );
                }
            });
        } catch (err) {
            loading.hide();
            snackbar.error(err.message || err);
            this.backCampaignConfiguration();
        }
    }

    waitforElementToLoad(iframeDocument, selector) {
        return new Promise(resolve => {
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

    async setDashboardStyling(iframe, dataSetId) {
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

    async getDashboardURL(dataSetId, config, d2) {
        const { snackbar, loading, db } = this.props;
        const dataSet = dataSetId ? await getDatasetById(dataSetId, d2) : null;
        const msg = i18n.t("No dashboards associated with this campaign");

        if (!dataSetId) {
            return getDhis2Url(d2, `/dhis-web-dashboard/#/`);
        } else if (dataSet) {
            const campaign = await Campaign.get(config, db, dataSet.id);

            let dashboardId;
            if (campaign.dashboardId) {
                dashboardId = campaign.dashboardId;
            } else {
                loading.show(
                    true,
                    i18n.t(
                        "It loooks like it's the first time you are accessing the dashboard for this campaign. Generating dashboard. This may take up to a couple of minutes"
                    )
                );
                this.setState({ isGenerating: true });
                dashboardId = await campaign.createDashboard();
                loading.hide();
                this.setState({ isGenerating: false });
            }

            if (dashboardId) {
                return getDhis2Url(d2, `/dhis-web-dashboard/#/${dashboardId}`);
            } else {
                snackbar.error(msg);
            }
        } else {
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
                            style={styles.iframe}
                        />
                    ) : (
                        !isGenerating && <LinearProgress />
                    )}
                </div>
            </React.Fragment>
        );
    }
}

const styles = {
    iframe: { width: "100%", height: "calc(100vh - 140px)" },
};

function remove(document, selector) {
    const el = document.querySelector(selector);
    if (el) el.remove();
}

export default withLoading(withSnackbar(withPageVisited(Dashboard, "dashboard")));
