import React from "react";
import Linkify from "react-linkify";
import _ from "lodash";
import { withSnackbar, ConfirmationDialog } from "d2-ui-components";
import { withStyles } from "@material-ui/core/styles";
import {
    LinearProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    createStyles,
    WithStyles,
    Theme,
} from "@material-ui/core";

import i18n from "../../locales";
import { Maybe } from "../../models/db.types";
import TargetPopulation from "../target-population/TargetPopulation";
import DbD2 from "../../models/db-d2";
import Campaign from "../../models/campaign";
import { MetadataConfig } from "../../models/config";
import { getValidationMessages } from "../../utils/validations";
import { redirectToLandingPageIfLegacy } from "./validations";
import { withRouter } from "react-router-dom";

interface Props extends WithStyles<typeof styles> {
    dataSet: { id: string };
    config: MetadataConfig;
    onClose: () => void;
    db: DbD2;
    snackbar: any;
    history: any;
}

interface State {
    campaign: Maybe<Campaign>;
    isSaving: boolean;
    changed: boolean;
    confirmClose: boolean;
    areValuesUpdated: boolean;
}

class TargetPopulationDialog extends React.Component<Props, State> {
    state: State = {
        campaign: undefined,
        isSaving: false,
        changed: false,
        confirmClose: false,
        areValuesUpdated: false,
    };

    styles = {
        progress: { marginTop: 10 },
    };

    async componentDidMount() {
        const { dataSet, db, config, onClose, snackbar, history } = this.props;

        try {
            const campaign = await Campaign.get(config, db, dataSet.id);
            if (redirectToLandingPageIfLegacy(campaign, snackbar, history)) {
                onClose();
                return;
            }

            const campaignWithTargetPopulation = await campaign.withTargetPopulation();
            const { targetPopulation } = campaignWithTargetPopulation;
            const areValuesUpdated = targetPopulation
                ? await targetPopulation.areDataValuesUpTodate()
                : false;
            this.setState({ campaign: campaignWithTargetPopulation, areValuesUpdated });
        } catch (err0) {
            const err = err0 as any;
            snackbar.error(i18n.t("Cannot load campaign") + ": " + (err.message || err));
            onClose();
        }
    }

    save = async () => {
        const { onClose, snackbar } = this.props;
        const { campaign, isSaving } = this.state;

        if (!campaign || isSaving) return;

        this.setState({ isSaving: true });
        const errors = await getValidationMessages(campaign, ["targetPopulation"]);

        if (!_(errors).isEmpty()) {
            this.setState({ isSaving: false });
            snackbar.error(errors.join("\n"));
            return;
        }

        try {
            const saveResponse = await campaign.saveTargetPopulation();

            if (saveResponse.status) {
                snackbar.success(`${i18n.t("Target population set")}: ${campaign.name}`);
                onClose();
            } else {
                this.setState({ isSaving: false });
                snackbar.error(i18n.t("Error saving target population"));
            }
        } catch (err0) {
            const err = err0 as any;
            console.error(err);
            snackbar.error(err.message || err.toString());
            this.setState({ isSaving: false });
        }
    };

    onChange = (newCampaign: Campaign) => {
        this.setState({ campaign: newCampaign, changed: true });
    };

    requestClose = () => {
        const { onClose } = this.props;
        const { changed } = this.state;

        if (changed) {
            this.setState({ confirmClose: true });
        } else {
            onClose();
        }
    };

    confirmClose = () => {
        this.props.onClose();
    };

    cancelClose = () => {
        this.setState({ confirmClose: false });
    };

    confirmationCloseDialog = () => {
        const { onClose } = this.props;

        return (
            <ConfirmationDialog
                isOpen={true}
                onSave={onClose}
                onCancel={this.cancelClose}
                title={i18n.t(
                    "There are unsaved changes, are you sure you want to close the dialog?"
                )}
                cancelText={i18n.t("No")}
                saveText={i18n.t("Yes")}
            />
        );
    };

    public render() {
        const { classes } = this.props;
        const { campaign, isSaving, confirmClose, areValuesUpdated } = this.state;
        const ConfirmationCloseDialog = this.confirmationCloseDialog;

        const isReady = campaign && !isSaving;
        const title = i18n.t("Set Target Population") + ": " + (campaign ? campaign.name : "...");
        const description = i18n.t(
            `Insert the age distribution for your project(s).
            Insert the target population for each of the sites.
            Age distribution at project level will be used for all sites within that project.
            Age distribution can be modified for any of the sites if needed.

            If you leave this page and return to it again you might find that information is not updated yet. Do not worry, information was not lost, updated information will appear within a few minutes.

            The source of data may be {{- hyperlink}} or you may have access to local estimates (i.e. Ministry of Health)`,
            {
                hyperlink: "https://hmisocba.msf.es/external-static/Denominators_Tool_OCBA.xlsm",
            }
        );
        const warning = !areValuesUpdated
            ? i18n.t(
                  "This is the last available population data. Modify it for your campaign and remember to press button SAVE"
              )
            : null;

        return (
            <React.Fragment>
                <Dialog
                    disableBackdropClick={true}
                    fullWidth={true}
                    maxWidth={"xl"}
                    open={true}
                    onClose={this.requestClose}
                >
                    <DialogTitle>
                        {title}
                        {!isReady && <LinearProgress style={this.styles.progress} />}
                    </DialogTitle>

                    <DialogContent>
                        {campaign ? (
                            <React.Fragment>
                                {warning && <div className={classes.warning}>{warning}</div>}
                                <Linkify>{description}</Linkify>
                                <TargetPopulation campaign={campaign} onChange={this.onChange} />
                            </React.Fragment>
                        ) : (
                            i18n.t("Loading...")
                        )}
                    </DialogContent>

                    <DialogActions>
                        <Button onClick={this.requestClose} autoFocus>
                            {i18n.t("Close")}
                        </Button>

                        <Button onClick={this.save} disabled={!isReady}>
                            {isSaving ? i18n.t("Saving...") : i18n.t("Save")}
                        </Button>
                    </DialogActions>
                </Dialog>

                {confirmClose && <ConfirmationCloseDialog />}
            </React.Fragment>
        );
    }
}
const styles = (_theme: Theme) =>
    createStyles({
        warning: {
            marginBottom: 15,
            marginLeft: 3,
            fontSize: "1.1em",
            color: "#F00",
            textAlign: "center",
            backgroundColor: "#EEE",
            padding: 20,
        },
    });

export default withRouter(withSnackbar(withStyles(styles)(TargetPopulationDialog)));
