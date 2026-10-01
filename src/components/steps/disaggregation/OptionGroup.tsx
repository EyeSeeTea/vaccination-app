import React, { SFC } from "react";
import _ from "lodash";

import { withStyles } from "@material-ui/core/styles";
import { createStyles, WithStyles, Theme } from "@material-ui/core";

import { AntigenDisaggregationOptionGroup } from "../../../models/AntigensDisaggregation";
import SimpleCheckbox from "../../forms/SimpleCheckBox";
import SimpleSelect from "../../forms/SimpleSelect";

type Path = (number | string)[];

interface OptionGroupProps extends WithStyles<typeof styles> {
    optionGroup: AntigenDisaggregationOptionGroup;
    isEditing: boolean;
    basePath: Path;
    update: (path: Path) => (value: any) => void;
}

const OptionGroup: SFC<OptionGroupProps> = props => {
    const { optionGroup, isEditing, basePath, classes, update } = props;

    return (
        <React.Fragment>
            <div className={classes.checkboxesGroup}>
                {(optionGroup.values[optionGroup.indexSelected] || []).map((option, optionIdx) =>
                    !isEditing ? (
                        option.selected && (
                            <span key={option.option.id} className={classes.optionValue}>
                                {option.option.displayName}
                            </span>
                        )
                    ) : (
                        <SimpleCheckbox
                            key={option.option.id}
                            checked={option.selected}
                            label={option.option.displayName}
                            onChange={update([
                                ...basePath,
                                "values",
                                optionGroup.indexSelected,
                                optionIdx,
                                "selected",
                            ])}
                        />
                    )
                )}
            </div>

            <div>
                {isEditing && optionGroup.values.length > 1 && (
                    <div className={classes.groupSelector}>
                        <SimpleSelect
                            value={optionGroup.indexSelected.toString()}
                            onChange={update([...basePath, "indexSelected"])}
                            options={optionGroup.values.map((og, index) => ({
                                text: og.map(o => o.option.displayName).join(" , "),
                                value: index.toString(),
                            }))}
                        />
                    </div>
                )}
            </div>
        </React.Fragment>
    );
};

const styles = (_theme: Theme) =>
    createStyles({
        checkboxesGroup: {
            display: "flex",
        },
        optionValue: {
            fontSize: "1.2em",
            marginTop: 14,
            marginLeft: 20,
            marginRight: 20,
        },
        groupSelector: {
            margin: "0 auto",
        },
    });

export default withStyles(styles)(OptionGroup);
