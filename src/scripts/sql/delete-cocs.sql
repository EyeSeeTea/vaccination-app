-- Build temp table with COC DB ids to delete
CREATE TEMP TABLE temp_ids AS
SELECT coc.categoryoptioncomboid FROM categoryoptioncombo coc JOIN temp_uids t ON t.uid = coc.uid;

ANALYZE temp_ids;

-- Delete from heavy value tables
DELETE FROM datavalue d USING temp_ids t WHERE d.categoryoptioncomboid = t.categoryoptioncomboid;
DELETE FROM datavalueaudit d USING temp_ids t WHERE d.categoryoptioncomboid = t.categoryoptioncomboid;

-- Delete from relation tables
DELETE FROM categoryoptioncombos_categoryoptions c USING temp_ids t WHERE c.categoryoptioncomboid = t.categoryoptioncomboid;
DELETE FROM categorycombos_optioncombos c USING temp_ids t WHERE c.categoryoptioncomboid = t.categoryoptioncomboid;

-- Delete section greyed fields / dataelementoperand
DELETE FROM sectiongreyedfields s
USING dataelementoperand deo, temp_ids t
WHERE s.dataelementoperandid = deo.dataelementoperandid
AND deo.categoryoptioncomboid = t.categoryoptioncomboid;

DELETE FROM dataelementoperand d USING temp_ids t WHERE d.categoryoptioncomboid = t.categoryoptioncomboid;

-- Delete main COC table
DELETE FROM categoryoptioncombo c USING temp_ids t WHERE c.categoryoptioncomboid = t.categoryoptioncomboid;

-- Cleanup temp tables
DROP TABLE temp_uids;
DROP TABLE temp_ids;
