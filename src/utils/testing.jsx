import React from "react";
import { mount as enzymeMount } from "enzyme";
import fetch from "node-fetch";
import OldMuiThemeProvider from "material-ui/styles/MuiThemeProvider";
import { MuiThemeProvider } from "@material-ui/core/styles";
import { SnackbarProvider } from "@eyeseetea/d2-ui-components";
import { muiTheme } from "../themes/dhis2.theme";

// DHIS2 expects a browser environment, add some required keys to the global node namespace
Object.assign(global, {
    Headers: fetch.Headers,
    window: {},
});

export function mount(component) {
    const wrappedComponent = enzymeMount(
        <MuiThemeProvider theme={muiTheme}>
            <OldMuiThemeProvider>
                <SnackbarProvider>{component}</SnackbarProvider>
            </OldMuiThemeProvider>
        </MuiThemeProvider>
    );

    //return wrappedComponent.find(component.type);
    return wrappedComponent;
}
