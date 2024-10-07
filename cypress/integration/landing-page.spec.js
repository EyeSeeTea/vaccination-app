/// <reference types="Cypress" />

context("Landing page", () => {
    before(() => {
        cy.login("admin");
        cy.loadPage();
    });

    beforeEach(() => {
        cy.login("admin");
        cy.visit("/");
    });

    describe("when rendered", () => {
        it("has page title", () => {
            cy.title().should("equal", "Vaccination App");
        });

        it("shows 3 pages of the application", () => {
            cy.get('[data-test="pages"]').should("have.length", 1).should("be.visible");

            cy.contains("Campaigns");
            cy.contains("Data Entry");
            cy.contains("Dashboard");
        });
    });

    describe("when clicked on Campaigns", () => {
        it("redirects to Campaigns", () => {
            cy.contains("Campaigns").click();
            cy.url().should("include", "/campaign-configuration");
        });
    });

    /*
    describe("when clicked on Data Entry", () => {
        it("redirects to Data Entry", () => {
            cy.contains("Data Entry").click({ force: true });
            cy.url().should("include", "/dhis-web-dataentry");
        });
    });
    describe("when clicked on Dashboard", () => {
        it("redirects to Dashboard", () => {
            cy.contains("Dashboard").click();
            cy.url().should("include", "/dhis-web-dashboard");
        });
    });
    
    describe("when clicked on Maintenance", () => {
        it("redirects to Maintenance", () => {
            cy.contains("Maintenance").click();
            cy.url().should("include", "/dhis-web-maintenance");
        });
    });
    */
});
