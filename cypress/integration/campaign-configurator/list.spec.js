describe("Campaign configuration - List page", () => {
    beforeEach(() => {
        cy.login("admin");
        cy.loadPage();
        cy.contains("Campaign Configuration").click();
    });

    it("should have the filter only my campaign set by default", () => {
        cy.get("[data-test='only-my-campaigns']").should("be.checked");
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
        cy.contains("Share");
        cy.contains("Delete");
        cy.contains("Go to Data Entry");
        cy.contains("Go to Dashboard");
        cy.contains("Download data");

        cy.contains("Details").click();
    });

    it("shows list of user dataset sorted alphabetically", () => {
        cy.get("[data-test='only-my-campaigns']").uncheck();

        cy.get(".data-table__rows > :nth-child(1) > :nth-child(2) span").then(text1 => {
            cy.get(".data-table__rows > :nth-child(2) > :nth-child(2) span").then(text2 => {
                assert.isTrue(text1.text() < text2.text());
            });
        });
    });

    it("shows list of user dataset sorted alphabetically desc", () => {
        cy.get("[data-test='search']").clear();
        cy.server()
            .route("GET", "/api/dataSets*")
            .as("getDataSets");

        cy.contains("Name").click();

        cy.wait("@getDataSets");
        cy.wait(1000); // eslint-disable-line cypress/no-unnecessary-waiting
        cy.get(".data-table__rows > :nth-child(1) > :nth-child(2) span").then(text1 => {
            cy.get(".data-table__rows > :nth-child(2) > :nth-child(2) span").then(text2 => {
                console.log({ 1: text1.text(), 2: text2.text() });
                assert.isTrue(text1.text() > text2.text());
            });
        });
    });
    /*
    it("can filter datasets by name (case insensitive)", () => {
        cy.get("[data-test='only-my-campaigns']").uncheck();

        cy.server()
            .route("GET", "/api/dataSets**")
            .as("getDataSets");
        cy.get("[data-test='search']")
            .clear()
            .type("meningitis");
        cy.wait("@getDataSets");
        cy.get(".data-table__rows__row").should("have.length", 2);

        cy.get(".data-table__rows > :nth-child(1) > :nth-child(2) span").should(
            "have.text",
            "Meningitis Outbreak - Daily"
        );

        cy.get(".data-table__rows > :nth-child(2) > :nth-child(2) span").should(
            "have.text",
            "Meningitis Outbreak - Weekly"
        );
    });
    */
});
