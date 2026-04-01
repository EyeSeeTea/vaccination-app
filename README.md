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

Some of the unit tests use snapshot testing, where real calls to the DHIS2 instance are used to generate snapshots. When developing, if you need to create or update snapshots, you’ll need to provide additional parameters so the tests can access the DHIS2 instance:

```shell
$ DHIS2_BASE_URL=http://localhost:8080 DHIS2_AUTH=user:password yarn test --watch
```
