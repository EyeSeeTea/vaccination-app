import React from "react";
import PropTypes from "prop-types";
import i18n from "@dhis2/d2-i18n";
import Paper from "@material-ui/core/Paper";
import FontIcon from "material-ui/FontIcon";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import { withStyles } from "@material-ui/core/styles";
import { withRouter } from "react-router";
import { goToDhis2Url } from "../../utils/routes";

const lightGray = "#7a7a7a";
const styles = _theme => ({
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
        fontSize: 20,
    },
    icons: {
        fontSize: "60px !important",
        marginBottom: 20,
        color: `${lightGray} !important`,
    },
});

class LandingPage extends React.Component {
    static propTypes = {
        d2: PropTypes.object.isRequired,
    };

    onClick = key => {
        const { history, d2 } = this.props;
        switch (key) {
            case "campaign-configuration":
                history.push("/" + key);
                break;
            case "data-entry":
                history.push("/" + key);
                break;
            case "dashboard":
                history.push("/" + key);
                break;
            case "maintenance":
                goToDhis2Url(d2, "/dhis-web-maintenance/index.html");
                break;
            default:
                throw new Error(`Unsupported page key: ${key}`);
        }
    };

    render() {
        const { classes } = this.props;
        const items = [
            ["campaign-configuration", i18n.t("Campaign Configuration"), "edit"],
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
                    <FontIcon className={`material-icons ${classes.icons}`}>{icon}</FontIcon>
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
