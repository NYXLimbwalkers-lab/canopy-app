-- Add contract_url column to estimates table
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS contract_url text;
