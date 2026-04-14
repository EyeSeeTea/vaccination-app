declare module "@dhis2/d2-ui-core" {
    import React from "react";

    interface StoreInstance {
        getState(): unknown;
        setState(state: unknown): void;
    }

    export const Store: {
        create(): StoreInstance;
    };

    export const TextField: React.ComponentType<{
        floatingLabelText?: string;
        style?: React.CSSProperties;
        changeEvent?: string;
        multiLine?: boolean;
        onBlur?: React.FocusEventHandler<HTMLInputElement>;
        [key: string]: unknown;
    }>;

    export const Sidebar: React.ComponentType<{
        sections: Array<{ label: string; key: string }>;
        onChangeSection: (key: string) => void;
        [key: string]: unknown;
    }>;
}

declare module "@dhis2/d2-ui-forms" {
    import React from "react";
    import { ReactComponentLike } from "prop-types";

    export const FormBuilder: React.ComponentType<{
        fields: Array<{
            name: string;
            value: unknown;
            component: ReactComponentLike;
            props?: Record<string, unknown>;
            validators?: Array<{ message: string; validator: (value: string) => boolean }>;
            asyncValidators?: Array<(value: string) => Promise<string | undefined | void>>;
        }>;
        onUpdateField: (fieldName: string, newValue: string) => void;
        style?: React.CSSProperties;
    }>;

    export const Validators: {
        isRequired: (value: string) => boolean;
        isPositiveNumber: (value: number) => boolean;
    };
}
