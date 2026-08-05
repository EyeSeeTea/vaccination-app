Vaccination Campaign App is a DHIS2 Web Application designed as an easy-to-use tool for information management during reactive (and potentially preventive) vaccination campaigns that can be rapidly configured and is fully integrated with HMIS. It includes the following basic features:

-   Rapid and simple configuration of campaign datasets including: sites, teams, antigens and
    vaccine-specific age groups
-   Simplified interface for daily entry of vaccination and population data by site
-   Automatic daily update of population data using last entry
-   Easy data visualization: automated campaign dashboard linked to forms
-   Offline functionality (i.e. can work on our local servers) of data entry and visualization.
-   Option for post-campaign data entry
-   Generation of exportable/printable daily registers and tally sheets
-   Option to download data to Excel for local backup and/or more advanced analysis
-   Additional quality and safety indicators to be phased in following a pilot of core indicators

## Setup

```shell
$ nvm use
$ yarn install
$ yarn build
```

## Development

Start development server:

```shell
$ yarn start
```

This will open the development server at port 8081 and will connect to DHIS 2 instance http://localhost:8080.

Use custom values passing environment variables:

```shell
$ PORT=8082 REACT_APP_DHIS2_BASE_URL="https://play.dhis2.org/dev" yarn start
```

## Tests

Run unit tests:

```shell
$ yarn test
```

Some tests replay snapshots recorded from real DHIS2 API calls. To create or update those snapshots, point the tests to a live instance:

```shell
$ DHIS2_BASE_URL=http://localhost:8080 DHIS2_AUTH=user:password yarn test --watch
```

## Scripts

Maintenance scripts live in `src/scripts` and are run with `yarn run-script`. Check also [src/scripts/README.md](src/scripts/README.md).

### Update campaign disaggregations

Regenerates the sections (disaggregations) of existing campaigns. Only the sections are posted, the data set, teams and dashboards are left untouched.

```shell
$ yarn run-script src/scripts/update-campaign-disaggregations.ts \
    --url "http://localhost:8097" --auth "$MSF_ADMIN_AUTH" \
    --log-file=update-campaign-disaggregations.log --all-campaigns
```

Pass `--campaign-id ID` (repeatable) instead of `--all-campaigns` to update only some campaigns.

A typical use case: an age group is added to an antigen, so its category combo gets new category option combos. Existing campaigns keep their old sections, and the new age group shows up in their data entry forms even though it was not part of the campaign. Running the script rebuilds the sections, adding the new age group to the greyed fields of the campaigns that don't use it, so it no longer appears on their data entry.
