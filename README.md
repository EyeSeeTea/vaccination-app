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

```
$ yarn install
```

When using code of an unpublished d2-ui-components, the typical workflow would be to use `yarn link` to point to a development branch of that package. Unfortunately, `yarn link` does not work at the moment (see [this issue](https://github.com/facebook/create-react-app/issues/1107)). So, for now, you'll have to overwrite `node_modules/d2-ui-components` yourself and restart the server afterwards. When developing d2-ui-components, tweak with `node_modules/react-scripts/config/webpackDevServer.config.js` (more info [here](https://stackoverflow.com/a/49932996/188031)) to see changes in `node_modules` without restarting the server.

## Development

Start development server:

```
$ yarn start
```

This will open the development server at port 8081 and will connect to DHIS 2 instance http://localhost:8080.

Use custom values passing environment variables:

```
$ PORT=8082 REACT_APP_DHIS2_BASE_URL="https://play.dhis2.org/dev" yarn start
```

## Tests

Run unit tests:

```
$ yarn test
```

Run integration tests locally:

```
$ export CYPRESS_DHIS2_AUTH='admin:district'
$ export CYPRESS_EXTERNAL_API="http://localhost:8080"
$ export CYPRESS_ROOT_URL=http://localhost:8081

$ yarn cy:e2e:run # non-interactive
$ yarn cy:e2e:open # interactive UI
```

For this to work in Travis CI, you will have to create an environment variable CYPRESS_DHIS2_AUTH ([settings](https://travis-ci.org/tokland/vaccination-app/settings) -> Environment Variables) with the password used in your
testing DHIS2 instance.

## Build

```
$ yarn build-webapp
```

## i18n

### Update an existing language

```
$ yarn update-po
# ... add/edit translations in po files ...
$ yarn localize
```

### Create a new language

```
$ cp i18n/en.pot i18n/es.po
# ... add translations to i18n/es.po ...
$ yarn localize
```
