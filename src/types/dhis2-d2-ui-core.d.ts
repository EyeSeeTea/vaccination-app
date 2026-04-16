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
