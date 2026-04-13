import { HideGreyedOutColumnsForForm, ReorderTablesForAntigen } from "../OldDataEntryContentScript";
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";

describe("Old Data Entry App Content Script", () => {
    describe(ReorderTablesForAntigen.name, () => {
        it("reorders tables as administered + used + quality&safety", () => {
            const document = getPage();
            new ReorderTablesForAntigen(document).execute();
            expect(document.body.outerHTML).toMatchSnapshot("ReorderTablesForAntigen");
        });
    });

    describe(HideGreyedOutColumnsForForm.name, () => {
        it("hides full greyed-out columns", () => {
            const document = getPage();
            new HideGreyedOutColumnsForForm(document).execute();
            expect(document.body.outerHTML).toMatchSnapshot("HideGreyedOutColumnsOnTables");
        });
    });
});

function getPage(): Document {
    const htmlPath = path.join(__dirname, "old-data-entry-vaccionation-form.html");
    const html = fs.readFileSync(htmlPath, "utf-8");
    return new JSDOM(html).window.document;
}
