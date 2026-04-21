import React from "react";
import i18n from "@dhis2/d2-i18n";
import Paper from "@material-ui/core/Paper";
import Icon from "@material-ui/core/Icon";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import { WithStyles, withStyles, createStyles, Theme } from "@material-ui/core/styles";
import { RouteComponentProps, withRouter } from "react-router-dom";
import { Routes } from "./Routes";

const lightGray = "#7a7a7a";

const styles = (_theme: Theme) =>
    createStyles({
        root: {
            display: "flex",
            justifyContent: "center",
        },
        paper: {
            width: "90%",
            padding: 10,
        },
        listItem: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            "&:hover": {
                backgroundColor: "#f9f9f9",
            },
            cursor: "pointer",
        },
        title: {
            color: lightGray,
            marginTop: 10,
            marginBottom: 10,
            marginLeft: 20,
            fontSize: 20,
        },
        icons: {
            fontSize: "60px !important",
            marginTop: 10,
            marginBottom: 10,
            color: `${lightGray} !important`,
        },
    });

type LandingPageOwnProps = {
    routes: Routes;
};

type LandingPageProps = LandingPageOwnProps & RouteComponentProps & WithStyles<typeof styles>;

class LandingPage extends React.Component<LandingPageProps> {
    onClick = (key: string) => {
        const { history, routes } = this.props;
        switch (key) {
            case "campaign-configuration":
            case "data-entry":
            case "dashboard":
                history.push("/" + key);
                break;
            case "maintenance":
                window.location.href = routes.getMaintenanceUrl();
                break;
            default:
                throw new Error(`Unsupported page key: ${key}`);
        }
    };

    render() {
        const { classes } = this.props;
        const items: Array<[key: string, title: string, icon: string]> = [
            ["campaign-configuration", i18n.t("Campaigns"), "edit"],
            ["data-entry", i18n.t("Data Entry"), "library_books"],
            ["dashboard", i18n.t("Dashboard"), "dashboard"],
        ];
        const menuItems = items.map(([key, title, icon]) => (
            <ListItem
                key={key}
                data-test={`page-${key}`}
                onClick={this.onClick.bind(this, key)}
                className={classes.listItem}
            >
                <ListItemIcon>
                    <Icon className={classes.icons}>{icon}</Icon>
                </ListItemIcon>
                <ListItemText primary={title} classes={{ primary: classes.title }} />
            </ListItem>
        ));

        return (
            <div className={classes.root}>
                <Paper className={classes.paper}>
                    <List data-test="pages">{menuItems}</List>
                </Paper>
            </div>
        );
    }
}

export default withRouter(withStyles(styles)(LandingPage));
