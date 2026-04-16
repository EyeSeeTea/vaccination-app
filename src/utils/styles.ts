import { createTheme } from "@material-ui/core";
import { Overrides } from "@material-ui/core/styles/overrides";
import { muiTheme } from "../themes/dhis2.theme";

export function createMuiThemeOverrides(overrides: Overrides) {
    return createTheme({
        ...muiTheme,
        overrides,
    });
}
