declare module "@dhis2/app-runtime/experimental" {
    import { ReactEventHandler } from "react";

    export type PluginProps = {
        /** URL used as the iframe `src`. */
        pluginSource?: string;
        /** App short name; its plugin launch URL is looked up from `/api/apps`. */
        pluginShortName?: string;
        /** Iframe height. Defaults to content-driven resizing. */
        height?: string | number;
        /** Iframe width. Defaults to `100%`. */
        width?: string | number;
        /** Class applied to the iframe. Size styles override width/height props. */
        className?: string;
        /** When set, width is driven by plugin contents via a resize observer. */
        clientWidth?: string | number;
        /** Called on the iframe's load event. */
        onLoad?: ReactEventHandler<HTMLIFrameElement>;
        /** When set, alerts are shown within the plugin iframe. */
        showAlertsInPlugin?: boolean;

        // Specific Props forwarded to the Aggregate Data Entry plugin via post-robot.

        // mode: app (renders the full app, without the header bar) or custom-form mode.
        mode?: "app" | "custom-form";
        hideDataSetSelector?: boolean;
        hideTabSectionSelector?: boolean;
        hideClearSelectionsButton?: boolean;
        hideFilterField?: boolean;
    };

    export const Plugin: (props: PluginProps) => JSX.Element;
}
