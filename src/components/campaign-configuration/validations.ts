import i18n from "../../locales";
import Campaign from "../../models/campaign";

type Snackbar = {
    error: (message: string) => void;
};

type History = {
    push: (path: string) => void;
};

export function redirectToLandingPageIfLegacy(
    campaign: Campaign,
    snackbar: Snackbar,
    history: History
): boolean {
    if (campaign.isLegacy()) {
        snackbar.error(i18n.t("This campaign is not editable, please contact the administrator."));
        history.push("/campaign-configuration");
        return true;
    } else {
        return false;
    }
}
