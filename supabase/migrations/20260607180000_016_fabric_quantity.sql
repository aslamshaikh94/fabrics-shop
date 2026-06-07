/*
  # Add quantity column to fabrics table
  
  This adds a quantity field (e.g. "10 Rolls") to track fabric inventory in bulk units.
*/

ALTER TABLE fabrics 
ADD COLUMN IF NOT EXISTS quantity text NOT NULL DEFAULT '';