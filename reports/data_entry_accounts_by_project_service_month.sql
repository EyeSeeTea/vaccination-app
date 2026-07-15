-- List of distinct accounts that entered data per project, service, and reporting month.
-- Helps identify whether data entry is a shared responsibility or concentrated in few accounts,
-- and allows analysing distinct accounts across different services.
-- MM/YYYY is the month the data was entered (dv.created), not the reporting period.
--
-- Scope: OU level 6 only, non-deleted datavalues, non-null storedby.
-- DE exclusions: add names to the IN () list as needed.
--
-- To restrict to a subtree, uncomment the ou6.path line below and replace the UID.
SELECT DISTINCT
    dv.storedby AS account,
    ou4.name AS project_name,
    ou4.uid AS project_id,
    ou6.name AS service_name,
    ou6.uid AS service_id,
    TO_CHAR(DATE_TRUNC('month', dv.created), 'MM/YYYY') AS month_year
FROM
    datavalue dv
    JOIN organisationunit ou6 ON ou6.organisationunitid=dv.sourceid
    AND ou6.hierarchylevel=6
    JOIN organisationunit ou4 ON ou4.uid=split_part(ou6.path, '/', 5)
WHERE
    dv.deleted=FALSE
    AND dv.storedby IS NOT NULL
    -- AND ou6.path LIKE '%/J1tZadFU6MO/%'  -- uncomment to filter by OU (any level)
    AND dv.dataelementid NOT IN (
        SELECT
            dataelementid
        FROM
            dataelement
        WHERE
            name ILIKE '%population%'
    )
ORDER BY
    ou4.name,
    ou6.name,
    month_year,
    account;
