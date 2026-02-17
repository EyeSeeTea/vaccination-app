-- Indexes to increate the performance of delete operations of category option combos. 
-- These indexes are created concurrently to avoid locking the tables for reads.

--- data values
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_datavalue_attoptcombo ON datavalue (attributeoptioncomboid);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_datavalue_catoptcombo ON datavalue (categoryoptioncomboid);

-- data value audits
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_datavalueaudit_attoptcombo ON datavalueaudit (attributeoptioncomboid);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_datavalueaudit_catoptcombo ON datavalueaudit (categoryoptioncomboid);

-- event-related tables
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programstageinstance_attoptcombo ON programstageinstance (attributeoptioncomboid);

-- datadimensionitem
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_datadimensionitem_deoperand_catoptcombo ON datadimensionitem (dataelementoperand_categoryoptioncomboid);
