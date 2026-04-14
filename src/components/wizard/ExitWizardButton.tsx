import React from "react";
import { ConfirmationDialog } from "@eyeseetea/d2-ui-components";
import i18n from "@dhis2/d2-i18n";

type ExitWizardButtonProps = {
    isOpen?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

class ExitWizardButton extends React.Component<ExitWizardButtonProps> {
    render() {
        const { isOpen, onCancel, onConfirm } = this.props;

        if (!isOpen) return null;

        return (
            <ConfirmationDialog
                isOpen={true}
                onSave={onConfirm}
                onCancel={onCancel}
                title={i18n.t("Cancel Campaign Creation?")}
                description={i18n.t(
                    "You are about to exit the Campaign Creation Wizard. All your changes will be lost. Are you sure you want to proceed?"
                )}
                saveText={i18n.t("Yes")}
                cancelText={i18n.t("No")}
            />
        );
    }
}

export default ExitWizardButton;
