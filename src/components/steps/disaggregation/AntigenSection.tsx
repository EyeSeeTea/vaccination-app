import React from "react";
import _ from "lodash";

import { withStyles } from "@material-ui/core/styles";
import {
    FormControl,
    FormControlLabel,
    Radio,
    RadioGroup,
    Table,
    TableBody,
    TableCell,
    TableRow,
} from "@material-ui/core";
import { createStyles, WithStyles, Theme } from "@material-ui/core";

import i18n from "../../../locales";
import { AntigenDisaggregation, CampaignType } from "../../../models/AntigensDisaggregation";
import SimpleCheckbox from "../../forms/SimpleCheckBox";
import DataElement from "./DataElement";
import { memoize } from "../../../utils/memoize";

type Path = (number | string)[];

interface AntigenSectionProps extends WithStyles<typeof styles> {
    antigen: AntigenDisaggregation;
    antigenCode: string;
    update: (path: Path) => (value: any) => void;
    setCampaignType(type: CampaignType): void;
}

interface DisaggregationStepState {
    editPath: Path | null;
}

class AntigenSection extends React.Component<AntigenSectionProps, DisaggregationStepState> {
    state: DisaggregationStepState = {
        editPath: null,
    };

    isEditing = (path: Path): boolean => {
        return _.isEqual(this.state.editPath, path);
    };

    toggleEdit = memoize((path: Path) => () => {
        const editPathUpdated = _.isEqual(this.state.editPath, path) ? null : path;
        this.setState({ editPath: editPathUpdated });
    });

    render() {
        const { antigen, antigenCode, classes, update, setCampaignType } = this.props;
        const { isTypeSelectable } = this.props.antigen;

        return (
            <Table className={classes.table}>
                <TableBody>
                    {isTypeSelectable && (
                        <TypeSelect antigen={antigen} setCampaignType={setCampaignType} />
                    )}

                    {_.flatMap(antigen.dataElements, (dataElement, dataElementIdx) => [
                        <TableRow key={dataElementIdx}>
                            <TableCell component="th" scope="row">
                                <SimpleCheckbox
                                    checked={dataElement.selected}
                                    disabled={!dataElement.optional}
                                    onChange={update([
                                        antigenCode,
                                        "dataElements",
                                        dataElementIdx,
                                        "selected",
                                    ])}
                                    label={dataElement.name}
                                />
                            </TableCell>
                        </TableRow>,

                        dataElement.selected && _(dataElement.categories).some("visible") && (
                            <TableRow key={dataElementIdx + "-dis"}>
                                <TableCell colSpan={2}>
                                    <DataElement
                                        antigenCode={antigenCode}
                                        dataElementIdx={dataElementIdx}
                                        categories={dataElement.categories}
                                        basePath={[antigenCode, "dataElements", dataElementIdx]}
                                        update={update}
                                        isEditing={this.isEditing}
                                        toggleEdit={this.toggleEdit}
                                    />
                                </TableCell>
                            </TableRow>
                        ),
                    ])}
                </TableBody>
            </Table>
        );
    }
}

interface TypeSelectProps {
    antigen: AntigenDisaggregation;
    setCampaignType(type: CampaignType): void;
}

class TypeSelect extends React.Component<TypeSelectProps> {
    handleOptionChange = (_event: React.ChangeEvent<{}>, value: string) => {
        if (value === "preventive" || value === "reactive") {
            this.props.setCampaignType(value);
        }
    };

    render() {
        return (
            <TableRow>
                <TableCell component="th" scope="row">
                    <FormControl>
                        <RadioGroup
                            row={true}
                            aria-label="option"
                            name="option"
                            value={this.props.antigen.type}
                            onChange={this.handleOptionChange}
                        >
                            <FormControlLabel
                                value="reactive"
                                control={<Radio />}
                                label={i18n.t("Reactive")}
                            />
                            <FormControlLabel
                                value="preventive"
                                control={<Radio />}
                                label={i18n.t("Preventive")}
                            />
                        </RadioGroup>
                    </FormControl>
                </TableCell>
            </TableRow>
        );
    }
}

const styles = (_theme: Theme) =>
    createStyles({
        table: {
            minWidth: 700,
        },
        nameTableCell: {
            width: "50%",
            fontSize: "1rem",
        },
    });

export default withStyles(styles)(AntigenSection);
