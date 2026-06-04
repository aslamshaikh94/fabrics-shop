-- Auto-update fabric available_meters when sales are inserted/updated/deleted
-- Sales don't use fabric_id directly (fabric_name stored in notes), so we
-- add a dedicated fabric_id_ref column that can optionally link to fabrics

-- For sales that have fabric_id linked, update available_meters
CREATE OR REPLACE FUNCTION update_fabric_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.fabric_id IS NOT NULL AND NEW.fabric_id != '00000000-0000-0000-0000-000000000000' THEN
      UPDATE fabrics SET available_meters = GREATEST(0, available_meters - NEW.meters), updated_at = now() WHERE id = NEW.fabric_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.fabric_id IS NOT NULL AND OLD.fabric_id != '00000000-0000-0000-0000-000000000000' THEN
      UPDATE fabrics SET available_meters = LEAST(total_meters, available_meters + OLD.meters), updated_at = now() WHERE id = OLD.fabric_id;
    END IF;
    IF NEW.fabric_id IS NOT NULL AND NEW.fabric_id != '00000000-0000-0000-0000-000000000000' THEN
      UPDATE fabrics SET available_meters = GREATEST(0, available_meters - NEW.meters), updated_at = now() WHERE id = NEW.fabric_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.fabric_id IS NOT NULL AND OLD.fabric_id != '00000000-0000-0000-0000-000000000000' THEN
      UPDATE fabrics SET available_meters = LEAST(total_meters, available_meters + OLD.meters), updated_at = now() WHERE id = OLD.fabric_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_fabric_stock ON sales;
CREATE TRIGGER trigger_update_fabric_stock
AFTER INSERT OR UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION update_fabric_stock();
