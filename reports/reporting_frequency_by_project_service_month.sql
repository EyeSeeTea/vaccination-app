-- Reporting frequency per project, service, and calendar month.
-- For each service (OU level 6) and month, picks the most granular period type
-- that has actual data values (Daily > Weekly > Monthly > Quarterly > Yearly).
-- This avoids datasets with many DEs biasing the result toward less granular frequencies.
--
-- Scope: OU level 6 only, non-deleted datavalues.
-- DE exclusions: add names to the IN () list as needed.
--
-- To restrict to a subtree, uncomment the ou6.path line in the final WHERE and replace the UID.
WITH
    source_month_periodtype AS (
        SELECT DISTINCT
            dv.sourceid,
            DATE_TRUNC('month', p.startdate) AS data_month,
            pt.name AS period_type_name,
            CASE pt.name
                WHEN 'Daily' THEN 1
                WHEN 'Weekly' THEN 2
                WHEN 'Monthly' THEN 3
                WHEN 'Quarterly' THEN 4
                WHEN 'Yearly' THEN 5
                ELSE 6
            END AS granularity_rank
        FROM
            datavalue dv
            JOIN period p ON p.periodid=dv.periodid
            JOIN periodtype pt ON pt.periodtypeid=p.periodtypeid
        WHERE
            dv.deleted=FALSE
            AND dv.sourceid IN (
                SELECT
                    organisationunitid
                FROM
                    organisationunit
                WHERE
                    hierarchylevel=6
            )
            AND dv.dataelementid NOT IN (
                SELECT
                    dataelementid
                FROM
                    dataelement
                WHERE
                    name ILIKE '%population%'
            )
    ),
    best_freq AS (
        SELECT DISTINCT
            ON (sourceid, data_month) sourceid,
            data_month,
            period_type_name AS reporting_frequency
        FROM
            source_month_periodtype
        ORDER BY
            sourceid,
            data_month,
            granularity_rank
    )
SELECT
    ou4.name AS project_name,
    ou4.uid AS project_id,
    ou6.name AS service_name,
    ou6.uid AS service_id,
    TO_CHAR(bf.data_month, 'MM/YYYY') AS month_year,
    bf.reporting_frequency
FROM
    best_freq bf
    JOIN organisationunit ou6 ON ou6.organisationunitid=bf.sourceid
    JOIN organisationunit ou4 ON ou4.uid=split_part(ou6.path, '/', 5)
    -- WHERE ou6.path LIKE '%/J1tZadFU6MO/%'  -- uncomment to filter by OU (any level)
ORDER BY
    ou4.name,
    ou6.name,
    bf.data_month;
