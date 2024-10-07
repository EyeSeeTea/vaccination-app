import { getApiUrl } from "../../support/utils";
import _ from "lodash";

describe("Campaigns - List page", () => {
    before(() => {
        cy.login("admin");
        cy.fixture("datasets.json").then(testDataSets => {
            cy.request("POST", getApiUrl("/metadata"), {
                dataSets: _.values(testDataSets),
            });
        });
    });

    beforeEach(() => {
        cy.login("admin");
        cy.loadPage();
        cy.contains("Campaigns").click();
    });

    after(() => {
        cy.fixture("datasets.json").then(testDataSets => {
            _(testDataSets).each(dataSet => {
                cy.request({
                    method: "DELETE",
                    url: getApiUrl(`/dataSets/${dataSet.id}`),
                    failOnStatusCode: false,
                });
            });
        });
    });

    it("shows list of user campaigns", () => {
        cy.get(".data-table__rows > :nth-child(3) > :nth-child(4) span").should("not.be.empty");
    });

    it("opens details window when mouse clicked", () => {
        cy.get(".data-table__rows > :nth-child(3) > :nth-child(4) span").click();
        cy.contains("API link");
        cy.contains("Id");
    });

    it("opens context window when right button mouse is clicked", () => {
        cy.get(".data-table__rows > :nth-child(3) > :nth-child(4) span")
            .first()
            .trigger("contextmenu");

        cy.contains("Details");
        cy.contains("Edit");
        cy.contains("Delete");
        cy.contains("Go to Data Entry");
        cy.contains("Go to Dashboard");

        cy.contains("Details").click();
    });

    it("shows list of user dataset sorted alphabetically", () => {
        cy.get(".data-table__rows > :nth-child(1) > :nth-child(2) span").then(text1 => {
            cy.get(".data-table__rows > :nth-child(2) > :nth-child(2) span").then(text2 => {
                assert.isTrue(text1.text() < text2.text());
            });
        });
    });

    it("shows list of user dataset sorted alphabetically desc", () => {
        cy.contains("Name").click();
        cy.wait(3000); // eslint-disable-line cypress/no-unnecessary-waiting

        cy.get(".data-table__rows > * > :nth-child(2) span").then(spans$ => {
            const names = spans$.get().map(x => x.innerText);
            const sortedNames = _(names)
                .orderBy(name => name.toLowerCase())
                .reverse()
                .value();
            assert.isTrue(_.isEqual(names, sortedNames));
        });
    });

    it("can filter datasets by name (case insensitive)", () => {
        cy.get("[data-test='search']").clear().type("cypress");

        cy.get(".data-table__rows__row").should("have.length", 3);

        cy.get(".data-table__rows > :nth-child(1) > :nth-child(2) span").should(
            "have.text",
            "cypressA"
        );

        cy.get(".data-table__rows > :nth-child(2) > :nth-child(2) span").should(
            "have.text",
            "cypressB"
        );
    });

    it("deletes a dataset when clicked on the Delete context action", () => {
        cy.get("[data-test='search']").clear().type("cypressC");
        cy.wait(3000); // eslint-disable-line cypress/no-unnecessary-waiting

        cy.get(".data-table__rows > :nth-child(1) > :nth-child(2) span")
            .first()
            .trigger("contextmenu");

        cy.contains("Delete").click();
        cy.contains("Yes").click();

        cy.contains("Campaign(s) deleted");
    });
});
