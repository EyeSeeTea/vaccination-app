import React from "react";
import i18n from "@dhis2/d2-i18n";
import { withRouter, RouteComponentProps } from "react-router-dom";
import _ from "lodash";
import { withSnackbar, Wizard, SnackbarState, WizardStep } from "@eyeseetea/d2-ui-components";
import { ReactComponentLike } from "prop-types";
import { LinearProgress } from "@material-ui/core";

import Campaign from "../../models/campaign";
import { D2 } from "../../models/d2.types";
import { D2Api } from "../../types/d2-api";
import { MetadataConfig } from "../../models/config";
import { CompositionRoot } from "../../CompositionRoot";
import DbD2 from "../../models/db-d2";
import PageHeader from "../shared/PageHeader";
import OrganisationUnitsStep from "../steps/organisation-units/OrganisationUnitsStep";
import SaveStep from "../steps/save/SaveStep";
import { getValidationMessages } from "../../utils/validations";
import GeneralInfoStep from "../steps/general-info/GeneralInfoStep";
import AntigenSelectionStep from "../steps/antigen-selection/AntigenSelectionStep";
import DisaggregationStep from "../steps/disaggregation/DisaggregationStep";
import { memoize } from "../../utils/memoize";
import ExitWizardButton from "../wizard/ExitWizardButton";
import { getVisitedAndUpdate } from "../utils/page-visited";
import { assertValue } from "../../utils/assert";

type RouteParams = {
    id?: string;
};

type CampaignWizardOwnProps = {
    d2: D2;
    db: DbD2;
    compositionRoot: CompositionRoot;
    api: D2Api;
    config: MetadataConfig;
};

type CampaignWizardProps = CampaignWizardOwnProps &
    RouteComponentProps<RouteParams> & { snackbar: SnackbarState };

type Step = {
    key: string;
    label: string;
    component: ReactComponentLike;
    validationKeys: string[];
    validationKeysLive?: string[];
    description: string;
    help?: string;
};

type CampaignWizardState = {
    campaign: Campaign | null;
    dialogOpen: boolean;
    pagesVisited: Record<string, boolean>;
    isCampaignUpdated: boolean;
    campaignHasDataValues?: boolean;
};

class CampaignWizard extends React.Component<CampaignWizardProps, CampaignWizardState> {
    constructor(props: CampaignWizardProps) {
        super(props);

        this.state = {
            campaign: null,
            dialogOpen: false,
            pagesVisited: {},
            isCampaignUpdated: false,
        };
    }

    async componentDidMount() {
        const { db, compositionRoot, config, match } = this.props;

        try {
            const campaignId = match.params.id;
            assertValue(campaignId, "Missing campaign ID");

            const campaign = this.isEdit()
                ? await compositionRoot.campaigns.get.execute(campaignId)
                : Campaign.create(config, db);

            const campaignHasDataValues = Boolean(
                campaign.id &&
                    (await compositionRoot.campaigns.hasData.execute(campaign.id).catch(err => {
                        console.error(err);
                        // Could not get data values (i.e. the user has no access to the org units),
                        // so assume the worse case (that the campaign has data) and continue.
                        return true;
                    }))
            );
            this.setState({ campaign, campaignHasDataValues });
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : String(err);
            this.props.snackbar.error(i18n.t("Cannot load campaign") + `: ${message}`);
            this.props.history.push("/campaign-configuration");
        }
    }

    isEdit() {
        return !!this.props.match.params.id;
    }

    getStepsBaseInfo(campaign: Campaign | null): Step[] {
        return [
            {
                key: "general-info",
                label: i18n.t("General info"),
                component: GeneralInfoStep,
                validationKeys: ["name", "startDate", "endDate"],
                description: i18n.t(
                    `Choose a name for the campaign and define the period for which data entry will be enabled`
                ),
                help: i18n.t(
                    `Give your campaign a name that makes it easy to recognize it in HMIS. The format to be used is: "YY {year} - MM ({month}-PRE/REAC {Preventive or Reactive} - Name of the project". Example -> "24-05-PRE-Diffa". The maximum length of the campaign name is 140 characters.

                    The start and end date should define the period for which you expect to enter data - i.e .the first and last day of your campaign. If you are not certain of the end date, enter a date a few weeks later than the expected date of completion (refer to your microplan). It is possible to edit the dates at any point in time.`,
                    { nsSeparator: false }
                ),
            },
            {
                key: "organisation-units",
                label: i18n.t("Organisation Units"),
                component: OrganisationUnitsStep,
                validationKeys: _.compact([
                    campaign && !campaign.isLegacy() ? "organisationUnits" : null,
                    "teams",
                ]),
                description: i18n.t(
                    `Select the health facilities or vaccination areas which will implement the campaign. At least one must be selected.`
                ),
                help: i18n.t(
                    `Select the health facilities or health areas which will implement the campaign. At least one must be selected. Only organisation units of level 5 (Health site) can be selected.`
                ),
            },
            {
                key: "antigen-selection",
                label: i18n.t("Antigen selection"),
                component: AntigenSelectionStep,
                validationKeys: ["antigens"],
                description: i18n.t(`Select the antigens which will be administered`),
                help: i18n.t(`Select the antigens which will be administered.`),
            },
            {
                key: "disaggregation",
                label: i18n.t("Configure Indicators"),
                component: DisaggregationStep,
                validationKeys: ["antigensDisaggregation"],
                validationKeysLive: [],
                description: i18n.t(
                    `Select the indicators and breakdowns that you wish to monitor for each antigen in your campaign.\n\n                Standard age groups for each antigen appear by default. In some cases, you may click on an age group to select subdivisions if that information is important for your campaign. Compulsory indicators may not be un-selected.`
                ),
            },
            {
                key: "save",
                label: i18n.t("Save"),
                component: SaveStep,
                validationKeys: [],
                description: i18n.t(
                    'Setup of your campaign is complete. Click the "Save" button to save your campaign, then you can set your target population, go to data entry and go to dashboard'
                ),
                help: i18n.t(
                    `Please review your vaccination campaign summary. Click the "Save" button to create the data set and all associated metadata for this campaign`
                ),
            },
        ];
    }

    cancelSave = () => {
        const { isCampaignUpdated } = this.state;

        if (isCampaignUpdated) {
            this.setState({ dialogOpen: true });
        } else {
            this.goToConfiguration();
        }
    };

    goToConfiguration = () => {
        this.props.history.push("/campaign-configuration");
    };

    handleDialogCancel = () => {
        this.setState({ dialogOpen: false });
    };

    onChange = memoize((step: Step) => async (campaign: Campaign) => {
        const errors = await getValidationMessages(campaign, step.validationKeysLive || []);
        this.setState({ campaign, isCampaignUpdated: true });

        if (!_(errors).isEmpty()) {
            this.props.snackbar.error(errors.join("\n"));
        }
    });

    onStepChangeRequest = async (currentStep: WizardStep, _newStep: WizardStep) => {
        const { campaign } = this.state;
        if (!campaign) return [];
        const step = currentStep as unknown as Step;
        return await getValidationMessages(campaign, step.validationKeys);
    };

    onStepChange = async (stepKey: string) => {
        const { d2 } = this.props;
        const { pagesVisited } = this.state;
        const visited = await getVisitedAndUpdate(d2, "vaccination-app", "wizard-" + stepKey);
        this.setState({ pagesVisited: { ...pagesVisited, [stepKey]: visited } });
    };

    render() {
        const { d2, location, compositionRoot } = this.props;
        const { campaign, dialogOpen, pagesVisited, campaignHasDataValues } = this.state;
        (window as unknown as Record<string, unknown>).campaign = campaign;

        const steps = this.getStepsBaseInfo(campaign).map(step => ({
            ...step,
            warning: campaignHasDataValues
                ? i18n.t(
                      "This campaign has data values. Editing a campaign with data values can create several problems, please contact the administrator."
                  )
                : undefined,
            helpDialogIsInitialOpen:
                pagesVisited[step.key] === undefined ? undefined : !pagesVisited[step.key],
            props: {
                d2,
                campaign,
                compositionRoot: compositionRoot,
                onChange: this.onChange(step),
                onCancel: this.goToConfiguration,
                api: this.props.api,
            },
        }));

        const urlHash = location.hash.slice(1);
        const stepExists = steps.find(step => step.key === urlHash);
        const firstStepKey = steps.map(step => step.key)[0];
        const initialStepKey = stepExists ? urlHash : firstStepKey;
        const lastClickableStepIndex = this.isEdit() ? steps.length - 1 : 0;
        const title = this.isEdit()
            ? i18n.t("Edit vaccination campaign")
            : i18n.t("New vaccination campaign");

        return (
            <React.Fragment>
                <ExitWizardButton
                    isOpen={dialogOpen}
                    onConfirm={this.goToConfiguration}
                    onCancel={this.handleDialogCancel}
                />
                <PageHeader
                    title={`${title}: ${campaign ? campaign.name : i18n.t("Loading...")}`}
                    onBackClick={this.cancelSave}
                />
                {campaign ? (
                    <Wizard
                        steps={steps}
                        initialStepKey={initialStepKey}
                        useSnackFeedback={true}
                        onStepChangeRequest={this.onStepChangeRequest}
                        onStepChange={this.onStepChange}
                        lastClickableStepIndex={lastClickableStepIndex}
                    />
                ) : (
                    <LinearProgress />
                )}
            </React.Fragment>
        );
    }
}

export default withSnackbar(withRouter(CampaignWizard));
