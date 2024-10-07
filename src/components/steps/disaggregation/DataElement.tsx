import React, { SFC } from "react";
import _ from "lodash";

import { withStyles } from "@material-ui/core/styles";
import { createStyles, WithStyles, Theme } from "@material-ui/core";
import { IconButton, Icon } from "@material-ui/core";

import i18n from "../../../locales";
import { AntigenDisaggregationCategoriesData } from "../../../models/AntigensDisaggregation";
import SimpleCheckbox from "../../forms/SimpleCheckBox";
import OptionGroup from "./OptionGroup";

type Path = (number | string)[];

interface DataElementProps extends WithStyles<typeof styles> {
    antigenCode: string;
    dataElementIdx: number;
    categories: AntigenDisaggregationCategoriesData;
    basePath: Path;
    update: (path: Path) => (value: any) => void;
    isEditing: (path: Path) => boolean;
    toggleEdit: (path: Path) => () => void;
}

const DataElement: SFC<DataElementProps> = props => {
    const { antigenCode, dataElementIdx, categories, classes, update, isEditing, toggleEdit } =
        props;

    const isEditingCategory = (categoryIdx: number) =>
        isEditing([antigenCode, dataElementIdx, categoryIdx]);
    const basePath = [antigenCode, "dataElements", dataElementIdx, "categories"];

    return (
        <div className={classes.categories}>
            <div className={classes.categoriesTitle}>{i18n.t("Disaggregation")}</div>
            {categories.map((category, categoryIdx) => (
                <div
                    key={category.code}
                    className={classes.categoriesWrapper}
                    style={{ display: category.visible ? "" : "none" }}
                >
                    <div className={classes.categoriesInnerWrapper}>
                        <SimpleCheckbox
                            key={category.code}
                            checked={category.selected}
                            disabled={!category.optional}
                            label={category.name}
                            onChange={update([...basePath, categoryIdx, "selected"])}
                        />
                    </div>

                    {category.selected && (
                        <div className={classes.categoryWrapper}>
                            {category.options.map((optionGroup, groupIndex) => (
                                <div
                                    key={groupIndex}
                                    className={_([
                                        classes.optionGroupWrapper,
                                        isEditingCategory(categoryIdx) &&
                                        optionGroup.values.length > 1
                                            ? classes.optionGroup
                                            : null,
                                    ])
                                        .compact()
                                        .join(" ")}
                                >
                                    <OptionGroup
                                        isEditing={isEditingCategory(categoryIdx)}
                                        basePath={[...basePath, categoryIdx, "options", groupIndex]}
                                        update={update}
                                        optionGroup={optionGroup}
                                    />
                                </div>
                            ))}
                            <IconButton
                                onClick={toggleEdit([antigenCode, dataElementIdx, categoryIdx])}
                                aria-label={i18n.t("Edit")}
                            >
                                <Icon
                                    color={isEditingCategory(categoryIdx) ? "primary" : "secondary"}
                                >
                                    edit
                                </Icon>
                            </IconButton>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

const styles = (_theme: Theme) =>
    createStyles({
        categories: {
            marginLeft: 40,
        },
        categoriesTitle: {
            display: "flex",
            fontSize: "0.9rem",
            borderBottom: "1px solid #e0e0e0",
            padding: "15px 0px",
            color: "#494949",
            fontWeight: 500,
        },
        categoriesWrapper: {
            display: "flex",
        },
        categoryWrapper: {
            display: "flex",
        },
        categoriesInnerWrapper: {
            width: "200px",
        },
        optionGroupWrapper: {
            textAlign: "center",
        },
        optionGroup: {
            backgroundColor: "rgb(243, 243, 243)",
            paddingLeft: 10,
            paddingRight: 10,
            paddingBottom: 8,
            marginRight: 5,
        },
    });

export default withStyles(styles)(DataElement);
