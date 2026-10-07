# Data Quality Reports

SQL queries to analyse data quality indicators from the DHIS2 aggregate database.

## Scope and common assumptions

-   Only **OU level 6** (service level) datavalues are considered.
-   Results are **disaggregated by project (OU level 4)**, with both name and UID included.
-   Only **aggregate** datavalues (non-deleted).
-   **Population DEs are excluded** from all queries (all aggregate DEs whose name contains "population").
-   A commented-out `ou6.path LIKE` filter is available in every query to restrict results to a subtree.

---

## 1. Number of changes in datavalues

**File:** `datavalue_changes_by_project_service_month.sql`
**Output:** `output/datavalue_changes_by_project_service_month.csv` — 189,364 rows — ~86 s

**Goal:** Identify how many datavalues were modified after their initial creation
(`lastupdated > created`), per project, service, and month of modification. A high number
of changes may indicate systematic data entry errors being corrected retrospectively.

**Columns:** `project_name`, `project_id`, `service_name`, `service_id`, `month_year`,
`num_changes`, `total_datavalues`

---

## 2. Delay in doing modifications

**File:** `datavalue_modification_delay_by_project_service_month.sql`
**Output:** `output/datavalue_modification_delay_by_project_service_month.csv` — 132,563 rows — ~13 s

**Goal:** For datavalues that were actually modified (`lastupdated > created`), measure the
average number of days between creation and last update. A high delay suggests errors are
being caught late rather than early, which is relevant for the typology agenda.

**Columns:** `project_name`, `project_id`, `service_name`, `service_id`, `month_year`,
`avg_delay_days`

**Notes:**

-   Only modified datavalues are included; unmodified ones do not contribute to the average.
-   A bulk retrospective data migration would produce artificially high delays.

---

## 3. Reporting frequency

**File:** `reporting_frequency_by_project_service_month.sql`
**Output:** `output/reporting_frequency_by_project_service_month.csv` — 213,724 rows — ~87 s

**Goal:** For each service and calendar month, determine the most granular period type
that has actual data (`Daily > Weekly > Monthly > Quarterly > Yearly`). Tracks whether
projects are moving from monthly to more frequent (weekly/daily) reporting, which may
indicate growing data collection maturity.

**Columns:** `project_name`, `project_id`, `service_name`, `service_id`, `month_year`,
`reporting_frequency`

**Notes:**

-   Frequency is inferred from the **period type of the datavalue's period**.

---

## 4. Accounts doing data entry

**File:** `data_entry_accounts_by_project_service_month.sql`
**Output:** `output/data_entry_accounts_by_project_service_month.csv` — 238,497 rows — ~137 s

**Goal:** List the distinct accounts (`storedby`) that entered data per project,
service, and calendar month of entry — one row per account. Helps identify whether
data entry is a shared responsibility across multiple users or concentrated in a
single account, and allows analysing distinct accounts across different services.

**Columns:** `account`, `project_name`, `project_id`, `service_name`, `service_id`,
`month_year`

**Notes:**

-   `storedby` is the DHIS2 username

---

## 5. Delay in reporting

**File:** `reporting_delay_by_project_service_month.sql`
**Output:** `output/reporting_delay_by_project_service_month.csv` — 213,724 rows — ~110 s

**Goal:** Measure the average number of days between the end of a reporting period
(`period.enddate`) and when the data was entered (`dv.created`). Positive values mean
data was entered after the period closed (retrospective); values near zero or negative
mean real-time entry. Tracks the shift from retrospective to real-time reporting.

**Columns:** `project_name`, `project_id`, `service_name`, `service_id`, `month_year`,
`avg_delay_days`

**Notes:**

-   `dv.created` on data migrated from local servers reflects the sync timestamp, not the
    actual moment of entry. A commented-out filter (`dv.created >= '<date>'`) is available
    to restrict to cloud-entered data once the migration date is known.

---

## 6. Number of datavalues

**File:** `datavalue_count_by_project_service_month.sql`
**Output:** `output/datavalue_count_by_project_service_month.csv` — 213,724 rows — ~94 s

**Goal:** Count total and non-zero datavalues per project, service, and reporting month.
Measures the volume of data entry work and the proportion of fields that carry actual data
vs zero-filled placeholders.

**Columns:** `project_name`, `project_id`, `service_name`, `service_id`, `month_year`,
`num_datavalues`, `num_non_zero_datavalues`

**Notes:**

-   Non-zero is defined as `value NOT IN ('0', '0.0', '0.00')`.
-   January of each year shows inflated counts due to Yearly-period entries.
-   The ~90% zero rate is expected for template-style data entry and does not indicate
    missing data per se.
