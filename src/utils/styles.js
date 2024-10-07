import { createTheme } from "@material-ui/core";
import { muiTheme } from "../themes/dhis2.theme";

export function createMuiThemeOverrides(overrides) {
    return createTheme({
        typography: {
            useNextVariants: true,
        },
        ...muiTheme,
        overrides,
    });
}
