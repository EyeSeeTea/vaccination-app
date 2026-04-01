declare module "@dhis2/ui" {
    import * as React from "react";

    export interface HeaderBarProps {
        appName: string;
        email: string;
    }

    export const HeaderBar: React.ComponentType<HeaderBarProps>;
}
