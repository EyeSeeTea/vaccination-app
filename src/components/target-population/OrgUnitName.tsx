import React from "react";
import _ from "lodash";

import { withStyles } from "@material-ui/core/styles";

import { createStyles, WithStyles, Theme } from "@material-ui/core";
import { OrganisationUnitLevel } from "../../models/db.types";
import { OrganisationUnit } from "../../domain/entities/OrganisationUnit";

export interface OrgUnitNameProps extends WithStyles<typeof styles> {
    organisationUnitLevels: OrganisationUnitLevel[];
    organisationUnit: OrganisationUnit;
}

class OrgUnitNameComponent extends React.Component<OrgUnitNameProps> {
    organisationUnitLevelsByLevel: _.Dictionary<OrganisationUnitLevel>;

    constructor(props: OrgUnitNameProps) {
        super(props);
        this.organisationUnitLevelsByLevel = _.keyBy(props.organisationUnitLevels, "level");
    }

    render() {
        const { classes, organisationUnit } = this.props;
        const orgUnitLevel = this.organisationUnitLevelsByLevel[organisationUnit.level];
        const orgUnitLevelName = orgUnitLevel ? orgUnitLevel.displayName : null;

        return (
            <React.Fragment>
                {orgUnitLevelName ? (
                    <span className={classes.level}>
                        [{orgUnitLevelName}
                        ]&nbsp;
                    </span>
                ) : null}
                <span className={classes.name}>{organisationUnit.displayName}</span>
            </React.Fragment>
        );
    }
}

const styles = (_theme: Theme) =>
    createStyles({
        level: {
            fontStyle: "italic",
        },
        name: {},
    });

export default withStyles(styles)(OrgUnitNameComponent);
