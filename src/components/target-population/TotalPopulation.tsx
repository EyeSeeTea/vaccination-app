import React from "react";

import i18n from "../../locales";
import EditButton from "./EditButton";
import { WithStyles, TextField, Theme, createStyles } from "@material-ui/core";
import { withStyles } from "@material-ui/core/styles";
import { getShowValue } from "./utils";
import Value from "./Value";
import { TargetPopulationItem } from "../../models/TargetPopulation";
import OrgUnitName from "./OrgUnitName";
import { OrganisationUnitLevel } from "../../models/db.types";

export interface TotalPopulationProps extends WithStyles<typeof styles> {
    organisationUnitLevels: OrganisationUnitLevel[];
    isEditing: boolean;
    populationItem: TargetPopulationItem;
    onChange: (value: number) => void;
    onToggle: () => void;
}

class TotalPopulation extends React.Component<TotalPopulationProps> {
    setFocusTextField = (input: HTMLElement) => {
        if (input) {
            setTimeout(() => {
                input.focus();
            }, 100);
        }
    };

    onChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(ev.currentTarget.value);
        this.props.onChange(value);
    };

    public render() {
        const { classes, isEditing, onToggle, populationItem, organisationUnitLevels } = this.props;
        const { organisationUnit } = populationItem.populationTotal;

        return (
            <React.Fragment>
                <div className={classes.sectionTitle}>{i18n.t("Total population")}</div>

                <div>
                    <OrgUnitName
                        organisationUnit={organisationUnit}
                        organisationUnitLevels={organisationUnitLevels}
                    />
                    :
                    {isEditing ? (
                        <TextField
                            className={classes.populationField}
                            value={getShowValue(populationItem.populationTotal.value)}
                            onChange={this.onChange}
                            inputRef={this.setFocusTextField}
                        />
                    ) : (
                        <Value
                            value={getShowValue(populationItem.populationTotal.value)}
                            className={classes.value}
                        />
                    )}
                    <EditButton onClick={onToggle} active={isEditing} />
                </div>
            </React.Fragment>
        );
    }
}

const styles = (_theme: Theme) =>
    createStyles({
        sectionTitle: {
            fontWeight: 410,
        },
        populationField: {
            marginLeft: 10,
            marginTop: 7,
            width: "5em",
        },
        value: {
            marginLeft: 10,
            fontSize: "1.1em",
            fontWeight: "bold",
        },
    });

export default withStyles(styles)(TotalPopulation);
