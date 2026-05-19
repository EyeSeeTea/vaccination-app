-- Number of datavalue changes (lastupdated > created) per project, service, and month.
-- A change is any datavalue row whose last update timestamp is later than its creation,
-- which may indicate error correction or retrospective editing.
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
    COUNT(*) FILTER (
        WHERE
            dv.lastupdated>dv.created
    ) AS num_changes,
    COUNT(*) AS total_datavalues
FROM
    datavalue dv
    JOIN organisationunit ou6 ON ou6.organisationunitid=dv.sourceid
    AND ou6.hierarchylevel=6
    JOIN organisationunit ou4 ON ou4.uid=split_part(ou6.path, '/', 5)
WHERE
    dv.deleted=FALSE
    -- AND ou6.path LIKE '%/J1tZadFU6MO/%'  -- uncomment to filter by OU
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
