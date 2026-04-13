import React from "react";
import _ from "lodash";

import { withStyles } from "@material-ui/core/styles";
import { createStyles, WithStyles, Theme } from "@material-ui/core";
import { MuiThemeProvider } from "@material-ui/core";

import { D2 } from "../../../models/d2.types";
import Campaign, { Antigen } from "../../../models/campaign";
import { memoize } from "../../../utils/memoize";
import { createMuiThemeOverrides } from "../../../utils/styles";
import AntigenSection from "./AntigenSection";

// d2-ui Sidebar component has a prop "styles" to customize the leftBar styles, but it
// raises an error ("object is not extensible") when passed, so use a CSS file instead.

import "./DisaggregationStep.css";
import i18n from "../../../locales";
import SimpleCheckbox from "../../forms/SimpleCheckBox";
import { DataSet } from "../../../models/config";
import { CampaignType } from "../../../models/AntigensDisaggregation";

const { Sidebar } = require("@dhis2/d2-ui-core"); // Untyped

type Path = (number | string)[];

interface DisaggregationStepProps extends WithStyles<typeof styles> {
    d2: D2;
    campaign: Campaign;
    onChange: (campaign: Campaign) => void;
}

type Tab = { type: "antigen"; antigen: Antigen } | { type: "extra" };

interface DisaggregationStepState {
    currentTab: Tab;
}

class DisaggregationStep extends React.Component<DisaggregationStepProps, DisaggregationStepState> {
    firstAntigen = this.props.campaign.antigens[0];

    state: DisaggregationStepState = {
        currentTab: this.firstAntigen
            ? { type: "antigen", antigen: this.firstAntigen }
            : { type: "extra" },
    };

    update = memoize((path: Path) => (newValue: any) => {
        const { campaign, onChange } = this.props;
        const disaggregationDataUpdated = campaign.antigensDisaggregation.set(path, newValue);
        const campaignUpdated = campaign.setAntigensDisaggregation(disaggregationDataUpdated);
        onChange(campaignUpdated);
    });

    changeSection = (tabCode: string): void => {
        if (tabCode === "extra") {
            this.setState({ currentTab: { type: "extra" } });
        } else {
            const antigen = _(this.props.campaign.antigens).keyBy("code").get(tabCode);

            this.setState({ currentTab: { type: "antigen", antigen: antigen } });
        }
    };

    setExtraDataSet = (dataSet: DataSet, options: { isEnabled: boolean }): void => {
        const { campaign, onChange } = this.props;

        onChange(campaign.setExtraDataSet(dataSet, options));
    };

    setCampaignType = (type: CampaignType): void => {
        const { campaign, onChange } = this.props;
        const tab = this.state.currentTab;
        if (!tab || tab.type !== "antigen") return;
        const updated = campaign.antigensDisaggregation.setCampaignType(tab.antigen, type);
        const campaignUpdated = campaign.setAntigensDisaggregation(updated);
        onChange(campaignUpdated);
    };

    render() {
        const { classes, campaign } = this.props;
        const { currentTab: current } = this.state;

        const antigenDisaggregation = campaign.antigensDisaggregation;
        const currentAntigen =
            current.type === "antigen" ? antigenDisaggregation.forAntigen(current.antigen) : null;
        const sections = campaign.antigens
            .map(antigen => ({ label: antigen.name, key: antigen.code }))
            .concat([{ label: i18n.t("Extra Activities"), key: "extra" }]);

        const extraActivitiesDataSets = campaign.config.dataSets.extraActivities;

        return (
            <MuiThemeProvider theme={materialTheme}>
                <div className={classes.box}>
                    <div className={classes.leftBar}>
                        <Sidebar sections={sections} onChangeSection={this.changeSection} />
                    </div>

                    {currentAntigen ? (
                        <div className={classes.page}>
                            <AntigenSection
                                antigen={currentAntigen}
                                antigenCode={currentAntigen.code}
                                update={this.update}
                                setCampaignType={this.setCampaignType}
                            />
                        </div>
                    ) : (
                        <div className={classes.page}>
                            {extraActivitiesDataSets.map(dataSet => (
                                <div key={dataSet.id} className={classes.extra}>
                                    <SimpleCheckbox
                                        key={dataSet.id}
                                        checked={campaign.extraDataSets.some(
                                            dataSet_ => dataSet_.id === dataSet.id
                                        )}
                                        label={dataSet.name}
                                        onChange={isChecked =>
                                            this.setExtraDataSet(dataSet, { isEnabled: isChecked })
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </MuiThemeProvider>
        );
    }
}

const styles = (_theme: Theme) =>
    createStyles({
        box: {
            position: "relative",
            width: "auto",
            height: "auto",
            boxShadow: "rgba(0, 0, 0, 0.12) 0px 1px 6px, rgba(0, 0, 0, 0.12) 0px 1px 4px",
            paddingRight: 20,
            display: "flex",
            alignItems: "flex-start",
        },
        leftBar: {
            position: "absolute",
        },
        page: {
            paddingLeft: 295 + 8,
        },
        extra: {
            marginTop: 20,
            marginLeft: 30,
        },
    });

const materialTheme = createMuiThemeOverrides({
    MuiFormControlLabel: {
        label: {
            "&$disabled": {
                color: "#000",
            },
        },
    },
    MuiCheckbox: {
        colorSecondary: {
            "&$disabled": {
                color: "#444",
            },
        },
    },
    MuiTableCell: {
        root: {
            borderBottom: "1px solid #e0e0e0",
        },
    },
});

export default withStyles(styles)(DisaggregationStep);
