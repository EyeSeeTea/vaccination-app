import React from "react";
import i18n from "@dhis2/d2-i18n";
import { withSnackbar, SnackbarState } from "@eyeseetea/d2-ui-components";
import ReactDOM from "react-dom";
import moment from "moment";

import PageHeader from "../shared/PageHeader";
import {
    getOrganisationUnitsByDataSetId,
    getPeriodDatesFromDataSetId,
} from "../../models/datasets";
import { getDhis2Url } from "../../utils/routes";
import { LinearProgress } from "@material-ui/core";
import { withPageVisited } from "../utils/page-visited-app";
import { D2 } from "../../models/d2.types";
import { MetadataConfig } from "../../models/config";
import { Maybe } from "../../models/db.types";
import { makeStyles } from "../../utils/react";
import { assert } from "../../utils/assert";
import { CompositionRoot } from "../../CompositionRoot";

type DataEntryOwnProps = {
    d2: D2;
    config: MetadataConfig;
    pageVisited: Maybe<boolean>;
};

type RouteParams = {
    id?: string;
};

type DataEntryProps = DataEntryOwnProps & {
    compositionRoot: CompositionRoot;
    snackbar: SnackbarState;
    match: { params: RouteParams };
    history: { push: (path: string) => void };
};

type DataEntryState = {
    isDataEntryIdValid: boolean;
};

class DataEntry extends React.Component<DataEntryProps, DataEntryState> {
    state: DataEntryState = {
        isDataEntryIdValid: false,
    };

    styles = makeStyles({
        subtitle: { marginBottom: 10, marginLeft: 15 },
    });

    async componentDidMount() {
        const {
            d2,
            match: { params },
        } = this.props;
        const dataSetId = params.id;
        const organisationUnits = dataSetId
            ? await getOrganisationUnitsByDataSetId(dataSetId, d2)
            : null;

        if (!dataSetId || (dataSetId && organisationUnits)) {
            this.setState({ isDataEntryIdValid: true }, () => {
                // eslint-disable-next-line react/no-find-dom-node
                const iframe = ReactDOM.findDOMNode(this.refs.iframe) as HTMLIFrameElement;
                iframe.addEventListener(
                    "load",
                    this.setDatasetParameters.bind(this, iframe, dataSetId, organisationUnits, d2)
                );
            });
        } else {
            this.props.snackbar.error(i18n.t("No datasets associated with this campaign"));
        }
    }

    waitforOUSelection(element: Element) {
        return new Promise<void>(resolve => {
            const check = () => {
                if (element.childNodes.length > 0) {
                    resolve();
                } else {
                    setTimeout(check, 500);
                }
            };

            check();
        });
    }

    styleFrame(iframeDocument: Document) {
        iframeDocument.querySelector("#header")?.remove();
        const leftBar = iframeDocument.querySelector("#leftBar") as HTMLElement | null;
        if (leftBar) leftBar.style.top = "-10px";
        const body = iframeDocument.querySelector("body");
        if (body) body.style.marginTop = "-55px";
        iframeDocument.querySelector("#moduleHeader")?.remove();

        on(iframeDocument, "#currentSelection", el => el.remove());
        on(iframeDocument, "#completenessDiv #validateButton", el => el.remove());
        on(iframeDocument, "#completenessDiv .separator", el => el.remove());

        on(iframeDocument, "#completenessDiv", div => {
            (div as HTMLElement).style.display = "inline-block";
            (div as HTMLElement).style.paddingRight = "20px";
            (div as HTMLElement).style.width = "auto";
        });
    }

    async setDatasetParameters(
        iframe: HTMLIFrameElement,
        dataSetId: string | undefined,
        organisationUnits: string[] | null,
        d2: D2
    ) {
        if (!iframe.contentWindow) return;
        const iframeDocument = iframe.contentWindow.document;
        this.styleFrame(iframeDocument);

        if (organisationUnits) {
            // Select OU in the tree
            const iframeSelection = (iframe.contentWindow as unknown as Record<string, unknown>)
                .selection as { select: (ous: string[]) => void };
            iframeSelection.select(organisationUnits);

            // Wait for OU to be selected and select the dataset
            const selectedDataSet = iframeDocument.querySelector("#selectedDataSetId");
            if (!selectedDataSet) return;
            await this.waitforOUSelection(selectedDataSet);
            const option = iframeDocument.querySelector(
                `#selectedDataSetId [value="${dataSetId}"]`
            ) as HTMLOptionElement;
            option.selected = true;

            if (iframe.contentWindow)
                (
                    iframe.contentWindow as unknown as Record<string, unknown> & {
                        dataSetSelected: () => void;
                    }
                ).dataSetSelected();

            // Remove non-valid periods
            const periodDates = await getPeriodDatesFromDataSetId(assert(dataSetId), d2);
            if (!periodDates) return;
            const removeNonValidPeriods = () => {
                const selectDataSet = iframeDocument.querySelector(
                    "#selectedDataSetId"
                ) as HTMLSelectElement;
                const selectedDataSetId = selectDataSet.selectedOptions[0]?.value;
                if (selectedDataSetId === dataSetId) {
                    const selectPeriod = iframeDocument.querySelector(
                        "#selectedPeriodId"
                    ) as HTMLSelectElement;
                    const optionPeriods = Array.from(
                        selectPeriod.childNodes
                    ) as HTMLOptionElement[];
                    const formatStr = "YYYYMMDD";
                    const start = periodDates.startDate
                        ? moment.utc(periodDates.startDate).format(formatStr)
                        : null;
                    const end = periodDates.endDate
                        ? moment.utc(periodDates.endDate).format(formatStr)
                        : null;

                    if (start && end) {
                        optionPeriods.forEach(option => {
                            const optionDate = option.value;

                            if (optionDate && !(optionDate >= start && optionDate <= end)) {
                                selectPeriod.removeChild(option);
                            }
                        });
                    }
                }
            };
            removeNonValidPeriods();
            iframeDocument
                .querySelectorAll("#selectedDataSetId, #prevButton, #nextButton")
                .forEach(element => {
                    element.addEventListener("click", () => {
                        removeNonValidPeriods();
                    });
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

    render() {
        const { isDataEntryIdValid } = this.state;
        const { d2, pageVisited } = this.props;
        const dataEntryUrl = getDhis2Url(d2, "/dhis-web-dataentry/index.action");
        const help =
            i18n.t(`Select a) site where vaccination was performed, b) Reactive vaccination data set available at site level c) date of vaccination d) team that performed vaccination.

        Then enter data for the fields shown in the screen.`);
        const subtitle = i18n.t(
            `Please make sure all information is provided and there are no blank fields. Blank fields will be interpreted as missing information, as opposed to 0.
Once cells turn into green, all information is saved and you can leave the Data Entry Section`
        );

        return (
            <React.Fragment>
                <PageHeader
                    title={i18n.t("Data Entry")}
                    help={help}
                    onBackClick={this.backCampaignConfiguration}
                    pageVisited={pageVisited}
                />
                <div style={this.styles.subtitle}>{subtitle}</div>
                <div>
                    {isDataEntryIdValid ? (
                        <iframe
                            ref="iframe"
                            title={i18n.t("Data Entry")}
                            src={dataEntryUrl}
                            style={iframeStyles.iframe}
                        />
                    ) : (
                        <LinearProgress />
                    )}
                </div>
            </React.Fragment>
        );
    }
}

const iframeStyles = makeStyles({
    iframe: { width: "100%", height: 1000 },
});

function on(document: Document, selector: string, cb: (el: Element) => void) {
    document.querySelectorAll(selector).forEach(cb);
}

export default withSnackbar(withPageVisited(DataEntry, "data-entry"));
