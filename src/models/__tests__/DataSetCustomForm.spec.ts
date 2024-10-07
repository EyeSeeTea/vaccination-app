import { renderHeaderForGroup } from "../DataSetCustomForm";
import { co } from "./config-mock";
// @ts-ignore
import { prettyPrint } from "html";

describe("renderHeaderForGroup", () => {
    it("should return the correct header for the group", () => {
        const rows = renderHeaderForGroup(
            [
                [co("1y"), co("Male"), co("Host")],
                [co("1y"), co("Male"), co("Refugee")],
                [co("1y"), co("Female"), co("Host")],
                [co("5y"), co("Male"), co("Host")],
                [co("5y"), co("Female"), co("Refugee")],
            ],
            false
        );

        const [row1, row2, row3] = rows;

        expect(rows.length).toBe(3);

        if (!(row1 && row2 && row3)) return;

        const expectedRow1 = `<tr>
            <td class="header-first-column"></td>
            <th colspan="3" scope="col" class="data-header" data-translate><span align="center">1y</span></th>
            <th colspan="2" scope="col" class="data-header" data-translate><span align="center">5y</span></th>
            <th rowspan="3" class="data-header" data-translate><span align="center">Total</span></th>
        </tr>`;

        const expectedRow2 = `<tr>
            <td class="header-first-column"></td>
            <th colspan="2" scope="col" class="data-header" data-translate><span align="center">Male</span></th>
            <th colspan="1" scope="col" class="data-header" data-translate><span align="center">Female</span></th>
            <th colspan="1" scope="col" class="data-header" data-translate><span align="center">Male</span></th>
            <th colspan="1" scope="col" class="data-header" data-translate><span align="center">Female</span></th>
        </tr>`;

        const expectedRow3 = `<tr>
            <td class="header-first-column"></td>
            <th colspan="1" scope="col" class="data-header" data-translate><span align="center">Host</span></th>
            <th colspan="1" scope="col" class="data-header" data-translate><span align="center">Refugee</span></th>
            <th colspan="1" scope="col" class="data-header" data-translate><span align="center">Host</span></th>
            <th colspan="1" scope="col" class="data-header" data-translate><span align="center">Host</span></th>
            <th colspan="1" scope="col" class="data-header" data-translate><span align="center">Refugee</span></th>
        </tr>`;

        expectSameHtml(row1, expectedRow1);
        expectSameHtml(row2, expectedRow2);
        expectSameHtml(row3, expectedRow3);
    });
});

function expectSameHtml(html1: string, html2: string): void {
    const html1p = prettyPrint(html1);
    const html2p = prettyPrint(html2);
    expect(html1p).toEqual(html2p);
}
