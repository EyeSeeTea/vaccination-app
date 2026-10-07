-- Average delay between end of reporting period and data entry (dv.created) per
-- project, service, and reporting month.
-- Positive values = data entered after the period closed (retrospective).
-- Negative values = data entered before the period closed (real-time / early).
-- Computed as AVG(created - period.enddate) in days.
--
-- To focus on cloud-entered data only (post local-server migration),
-- uncomment and set the date below:
--   AND dv.created >= '2022-01-01'  -- replace with actual cloud migration date
--
-- Scope: OU level 6 only, non-deleted datavalues.
-- Averaged per service to avoid extra weight from services with many DEs.
-- DE exclusions: add names to the IN () list as needed.
--
-- To restrict to a subtree, uncomment the ou6.path line below and replace the UID.
SELECT
    ou4.name AS project_name,
    ou4.uid AS project_id,
    ou6.name AS service_name,
    ou6.uid AS service_id,
    TO_CHAR(DATE_TRUNC('month', p.startdate), 'MM/YYYY') AS month_year,
    ROUND(
        AVG(
            EXTRACT(
                EPOCH
                FROM
                    (dv.created-p.enddate)
            )/86400.0
        )::numeric,
        1
    ) AS avg_delay_days
FROM
    datavalue dv
    JOIN period p ON p.periodid=dv.periodid
    JOIN organisationunit ou6 ON ou6.organisationunitid=dv.sourceid
    AND ou6.hierarchylevel=6
    JOIN organisationunit ou4 ON ou4.uid=split_part(ou6.path, '/', 5)
WHERE
    dv.deleted=FALSE
    -- AND dv.created >= '2022-01-01'  -- uncomment to restrict to cloud-entered data
    -- AND ou6.path LIKE '%/J1tZadFU6MO/%'  -- uncomment to filter by OU (any level)
    AND dv.dataelementid NOT IN (
        SELECT
            dataelementid
        FROM
            dataelement
        WHERE
            name ILIKE '%population%'
    )
GROUP BY
    ou4.name,
    ou4.uid,
    ou6.name,
    ou6.uid,
    DATE_TRUNC('month', p.startdate)
ORDER BY
    ou4.name,
    ou6.name,
    month_year;
