import React from "react";
import i18n from "@dhis2/d2-i18n";

import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import Icon from "@material-ui/core/Icon";
import HelpButton from "../help-button/HelpButton";

import { Maybe } from "../../models/db.types";

interface PageHeaderProps {
    variant?: string;
    title: string;
    onBackClick: () => void;
    help?: string;
    pageVisited?: Maybe<boolean>;
}

function PageHeader({ variant = "h5", title, onBackClick, help, pageVisited }: PageHeaderProps) {
    return (
        <div>
            <IconButton
                onClick={onBackClick}
                color="secondary"
                aria-label={i18n.t("Back")}
                style={iconStyle}
            >
                <Icon color="primary">arrow_back</Icon>
            </IconButton>

            <Typography
                variant={variant as "h5"}
                style={{ display: "inline-block", fontWeight: 300 }}
            >
                {title}
                {help && (
                    <HelpButton
                        title={`${title} - ${i18n.t("Help")}`}
                        contents={help}
                        pageVisited={pageVisited}
                    />
                )}
            </Typography>
        </div>
    );
}

const iconStyle: React.CSSProperties = {
    paddingTop: 10,
    marginBottom: 5,
};

export default PageHeader;
