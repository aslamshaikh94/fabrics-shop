/*
  # User role management via app_metadata

  - app_metadata is server-side only — users cannot modify it themselves
  - Trigger auto-assigns role: 'user' on every new signup
  - set_user_role() lets a service-role caller promote/demote users
*/

-- Auto-assign default role on signup
CREATE OR REPLACE FUNCTION handle_new_user_role()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || '{"role": "user"}'
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_role();

-- Helper function to set role (run from SQL editor as postgres/service role)
CREATE OR REPLACE FUNCTION set_user_role(user_email text, user_role text)
RETURNS void AS $$
BEGIN
  IF user_role NOT IN ('admin', 'user') THEN
    RAISE EXCEPTION 'Invalid role: %', user_role;
  END IF;
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', user_role)
  WHERE email = user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
