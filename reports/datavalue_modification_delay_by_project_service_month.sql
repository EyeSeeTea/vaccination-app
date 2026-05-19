-- Average delay (in days) between creation and last update of changed datavalues,
-- per project, service, and month of modification.
-- Restricted to datavalues where lastupdated > created (i.e. actually modified).
-- A high average delay suggests late error correction rather than early detection.
--
-- Scope: OU level 6 only, non-deleted datavalues.
-- DE exclusions: add names to the IN () list as needed.
--
-- To restrict to a subtree, uncomment the ou6.path line below and replace the UID.
SELECT
    ou4.name AS project_name,
    ou4.uid AS project_id,
    ou6.name AS service_name,
    ou6.uid AS service_id,
    TO_CHAR(dv.lastupdated, 'MM/YYYY') AS month_year,
    ROUND(
        AVG(
            EXTRACT(
                EPOCH
                FROM
                    (dv.lastupdated-dv.created)
            )/86400.0
        )::numeric,
        1
    ) AS avg_delay_days
FROM
    datavalue dv
    JOIN organisationunit ou6 ON ou6.organisationunitid=dv.sourceid
    AND ou6.hierarchylevel=6
    JOIN organisationunit ou4 ON ou4.uid=split_part(ou6.path, '/', 5)
WHERE
    dv.deleted=FALSE
    AND dv.lastupdated>dv.created
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
    TO_CHAR(dv.lastupdated, 'MM/YYYY')
ORDER BY
    ou4.name,
    ou6.name,
    month_year;
