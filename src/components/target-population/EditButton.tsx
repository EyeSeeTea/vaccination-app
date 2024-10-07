import React from "react";
import i18n from "../../locales";

import { Icon, IconButton } from "@material-ui/core";

interface EditButtonProps {
    onClick: () => void;
    active: boolean;
}

class EditButton extends React.Component<EditButtonProps> {
    notifyOnClick = () => {
        this.props.onClick();
    };

    render() {
        const { active } = this.props;

        return (
            <IconButton onClick={this.notifyOnClick} aria-label={i18n.t("Edit")}>
                <Icon color={active ? "primary" : "secondary"}>edit</Icon>
            </IconButton>
        );
    }
}

export default EditButton;
