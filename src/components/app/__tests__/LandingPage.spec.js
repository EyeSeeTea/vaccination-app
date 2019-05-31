import React from "react";
import { shallow } from "enzyme";
import { unwrap } from "@material-ui/core/test-utils";
import ListItem from "@material-ui/core/ListItem";

import LandingPage from "../LandingPage";
import { getD2Stub } from "utils/testing";

const LanginPageUnwrapped = unwrap(LandingPage);

describe("Landing page", () => {
    const renderWithProps = props =>
        shallow(<LanginPageUnwrapped d2={getD2Stub()} classes={{}} {...props} />);

    it("renders 3 menu items", () => {
        const component = renderWithProps();
        expect(component.find(ListItem)).toHaveLength(3);
    });
});
