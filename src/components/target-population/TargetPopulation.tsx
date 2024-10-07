import React from "react";
import _ from "lodash";

import { withStyles } from "@material-ui/core/styles";
import {
    createStyles,
    WithStyles,
    Theme,
    Card,
    CardContent,
    ExpansionPanel,
    ExpansionPanelSummary,
    ExpansionPanelDetails,
    Typography,
    MuiThemeProvider,
} from "@material-ui/core";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";

import { memoize } from "../../utils/memoize";
import Campaign from "../../models/campaign";
import { Maybe, OrganisationUnit } from "../../models/db.types";
import TotalPopulation from "./TotalPopulation";
import { createMuiThemeOverrides } from "../../utils/styles";
import PopulationDistribution from "./PopulationDistribution";
import { getFullOrgUnitName } from "../../models/organisation-units";
import { groupTargetPopulationByArea } from "../../models/TargetPopulation";
import i18n from "../../locales";

export interface AgeGroupRow {
    ouId: string;
    antigenId: string;
}

interface TargetPopulationProps extends WithStyles<typeof styles> {
    campaign: Campaign;
    onChange: (campaign: Campaign) => void;
}

interface TargetPopulationState {
    editPopulation: Maybe<string>;
    editAgeGroupRow: Maybe<AgeGroupRow>;
}

class TargetPopulationComponent extends React.Component<
    TargetPopulationProps,
    TargetPopulationState
> {
    state: TargetPopulationState = {
        editPopulation: undefined,
        editAgeGroupRow: undefined,
    };

    onTotalPopulationChange = memoize((ouId: string) => (value: number) => {
        const { campaign, onChange } = this.props;
        if (!campaign.targetPopulation) return;

        const campaignUpdated = campaign.setTargetPopulation(
            campaign.targetPopulation.setTotalPopulation(ouId, value)
        );
        onChange(campaignUpdated);
    });

    onTotalPopulationToggle = memoize((ouId: string) => () => {
        const { editPopulation } = this.state;
        this.setState({ editPopulation: editPopulation === ouId ? undefined : ouId });
    });

    onAgeGroupPopulationChange = memoize(
        (orgUnits: OrganisationUnit[]) => (ageGroup: string, value: number) => {
            const { campaign, onChange } = this.props;
            const ageGroupSelector = { orgUnitIds: orgUnits.map(ou => ou.id), ageGroup };
            if (!campaign.targetPopulation) return;

            const campaignUpdated = campaign.setTargetPopulation(
                campaign.targetPopulation.setAgeGroupPopulation(ageGroupSelector, value)
            );
            onChange(campaignUpdated);
        }
    );

    onAgeGroupPopulationToggle = memoize((ouId: string) => (antigenId: string) => {
        const { editAgeGroupRow } = this.state;
        const ageGroupRow = { ouId, antigenId };
        this.setState({
            editAgeGroupRow: _.isEqual(editAgeGroupRow, ageGroupRow) ? undefined : ageGroupRow,
        });
    });

    getAntigenEditing(ouId: string): string | undefined {
        const { editAgeGroupRow } = this.state;
        return editAgeGroupRow && editAgeGroupRow.ouId === ouId
            ? editAgeGroupRow.antigenId
            : undefined;
    }

    render() {
        const { classes, campaign } = this.props;
        const { editPopulation } = this.state;
        const { targetPopulation } = campaign;

        if (!targetPopulation) return null;

        const { organisationUnitLevels } = targetPopulation;
        const targetPopulationByArea = groupTargetPopulationByArea(targetPopulation);

        return (
            <MuiThemeProvider theme={muiTheme}>
                {_.map(targetPopulationByArea, ({ area, items }) => (
                    <ExpansionPanel key={area.id} defaultExpanded={true} className={classes.wrap}>
                        <ExpansionPanelSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography className={classes.expansionPanelHeading}>
                                {i18n.t("Health Area")}
                                <br />
                                {getFullOrgUnitName(area)} [{items.length}]
                            </Typography>
                        </ExpansionPanelSummary>

                        <ExpansionPanelDetails className={classes.panelDetails}>
                            <PopulationDistribution
                                organisationUnitLevels={organisationUnitLevels}
                                orgUnitLevel={area.level}
                                antigenEditing={this.getAntigenEditing(area.id)}
                                targetPopulation={targetPopulation}
                                populationItem={items[0]}
                                onChange={this.onAgeGroupPopulationChange([
                                    area,
                                    ...items.map(item => item.organisationUnit),
                                ])}
                                onToggle={this.onAgeGroupPopulationToggle(area.id)}
                            />

                            <h3>{i18n.t("Health Sites")}</h3>

                            {items
                                .map(item => ({ ouId: item.organisationUnit.id, item }))
                                .map(({ ouId, item }) => (
                                    <div key={ouId}>
                                        <h4>{getFullOrgUnitName(item.organisationUnit)}</h4>

                                        <Card className={classes.card}>
                                            <CardContent>
                                                <TotalPopulation
                                                    organisationUnitLevels={organisationUnitLevels}
                                                    isEditing={editPopulation === ouId}
                                                    populationItem={item}
                                                    onChange={this.onTotalPopulationChange(ouId)}
                                                    onToggle={this.onTotalPopulationToggle(ouId)}
                                                />
                                            </CardContent>
                                        </Card>

                                        <Card className={classes.card}>
                                            <CardContent>
                                                <PopulationDistribution
                                                    organisationUnitLevels={organisationUnitLevels}
                                                    orgUnitLevel={item.organisationUnit.level}
                                                    antigenEditing={this.getAntigenEditing(ouId)}
                                                    targetPopulation={targetPopulation}
                                                    populationItem={item}
                                                    onChange={this.onAgeGroupPopulationChange([
                                                        item.organisationUnit,
                                                    ])}
                                                    onToggle={this.onAgeGroupPopulationToggle(ouId)}
                                                />
                                            </CardContent>
                                        </Card>
                                    </div>
                                ))}
                        </ExpansionPanelDetails>
                    </ExpansionPanel>
                ))}
            </MuiThemeProvider>
        );
    }
}

const styles = (_theme: Theme) =>
    createStyles({
        card: {
            margin: "15px 0px",
        },
        tableHead: {
            backgroundColor: "#E5E5E5",
        },
        tableCell: {},
        value: {
            marginLeft: 10,
            fontSize: "1.1em",
        },
        populationField: {
            marginLeft: 10,
            marginTop: 7,
            width: "5em",
        },
        expansionPanelHeading: {
            flexBasis: "100%",
            flexShrink: 0,
            fontSize: "1.15em",
            fontWeight: "bold",
        },
        panelDetails: {
            display: "block",
        },
        wrap: { margin: "16px 0" },
    });

const muiTheme = createMuiThemeOverrides({
    MuiTableCell: {
        root: {
            padding: "5px 5px 5px 5px",
            textAlign: "center",
        },
        body: {
            fontSize: "0.9em",
        },
        head: {
            fontSize: "0.9em",
        },
    },
});

export default withStyles(styles)(TargetPopulationComponent);
