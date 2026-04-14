CREATE TABLE IF NOT EXISTS warehouses (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  description TEXT,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  minimum_stock INTEGER NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS category_attributes (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'number', 'boolean', 'date', 'select', 'multiselect', 'json')),
  required BOOLEAN NOT NULL DEFAULT FALSE,
  options JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT category_attributes_category_id_key_unique UNIQUE (category_id, key)
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'operator')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  password_reset_at TIMESTAMPTZ,
  password_reset_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_stock (
  warehouse_id BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (warehouse_id, product_id)
);

CREATE TABLE IF NOT EXISTS warehouse_locations (
  id BIGSERIAL PRIMARY KEY,
  warehouse_id BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('zone', 'aisle', 'rack', 'shelf', 'bin', 'staging', 'other')),
  parent_location_id BIGINT REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_location_stock (
  warehouse_location_id BIGINT NOT NULL REFERENCES warehouse_locations(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (warehouse_location_id, product_id)
);

CREATE TABLE IF NOT EXISTS product_attributes (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_attribute_id BIGINT NOT NULL REFERENCES category_attributes(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_attributes_product_id_category_attribute_id_unique
    UNIQUE (product_id, category_attribute_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  warehouse_location_id BIGINT REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('entry', 'exit')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  movement_date TIMESTAMPTZ NOT NULL,
  observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id BIGSERIAL PRIMARY KEY,
  from_warehouse_id BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  from_location_id BIGINT REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  to_location_id BIGINT REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'completed', 'cancelled')) DEFAULT 'pending',
  requested_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  completed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  manual_destination TEXT,
  carrier_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id BIGSERIAL PRIMARY KEY,
  warehouse_id BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  warehouse_location_id BIGINT REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('increase', 'decrease', 'correction')),
  previous_quantity INTEGER NOT NULL CHECK (previous_quantity >= 0),
  adjusted_quantity INTEGER NOT NULL CHECK (adjusted_quantity >= 0),
  reason TEXT NOT NULL,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dispatches (
  id BIGSERIAL PRIMARY KEY,
  manual_destination TEXT NOT NULL,
  carrier_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0)
);

CREATE TABLE IF NOT EXISTS dispatch_items (
  id BIGSERIAL PRIMARY KEY,
  dispatch_id BIGINT NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS cycle_counts (
  id BIGSERIAL PRIMARY KEY,
  warehouse_id BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  warehouse_location_id BIGINT REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')) DEFAULT 'draft',
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cycle_count_items (
  id BIGSERIAL PRIMARY KEY,
  cycle_count_id BIGINT NOT NULL REFERENCES cycle_counts(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  expected_quantity INTEGER NOT NULL CHECK (expected_quantity >= 0),
  counted_quantity INTEGER CHECK (counted_quantity >= 0),
  difference INTEGER,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cycle_count_items_cycle_count_id_product_id_unique UNIQUE (cycle_count_id, product_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS critical_event_logs (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_entity_id BIGINT,
  target_entity_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON products(category_id);

CREATE INDEX IF NOT EXISTS idx_products_is_deleted
  ON products(is_deleted);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_unique
  ON products(sku)
  WHERE sku IS NOT NULL AND is_deleted = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique
  ON products(barcode)
  WHERE barcode IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_category_attributes_category_id
  ON category_attributes(category_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_locations_warehouse_id
  ON warehouse_locations(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_locations_parent_location_id
  ON warehouse_locations(parent_location_id);

CREATE INDEX IF NOT EXISTS idx_warehouses_is_deleted
  ON warehouses(is_deleted);

CREATE INDEX IF NOT EXISTS idx_warehouse_locations_is_deleted
  ON warehouse_locations(is_deleted);

CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_locations_warehouse_code_unique
  ON warehouse_locations(warehouse_id, code)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_warehouse_location_stock_product_id
  ON warehouse_location_stock(product_id);

CREATE INDEX IF NOT EXISTS idx_product_attributes_product_id
  ON product_attributes(product_id);

CREATE INDEX IF NOT EXISTS idx_product_attributes_category_attribute_id
  ON product_attributes(category_attribute_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id
  ON stock_movements(product_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_id
  ON stock_movements(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_location_id
  ON stock_movements(warehouse_location_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_movement_date
  ON stock_movements(movement_date);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_warehouse_id
  ON stock_transfers(from_warehouse_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_warehouse_id
  ON stock_transfers(to_warehouse_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_status
  ON stock_transfers(status);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_warehouse_id
  ON stock_adjustments(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_location_id
  ON stock_adjustments(warehouse_location_id);

CREATE INDEX IF NOT EXISTS idx_dispatch_items_dispatch_id
  ON dispatch_items(dispatch_id);

CREATE INDEX IF NOT EXISTS idx_dispatch_items_product_id
  ON dispatch_items(product_id);

CREATE INDEX IF NOT EXISTS idx_cycle_counts_warehouse_id
  ON cycle_counts(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_cycle_counts_status
  ON cycle_counts(status);

CREATE INDEX IF NOT EXISTS idx_cycle_count_items_cycle_count_id
  ON cycle_count_items(cycle_count_id);

CREATE INDEX IF NOT EXISTS idx_users_email
  ON users(email);

CREATE INDEX IF NOT EXISTS idx_users_is_deleted
  ON users(is_deleted);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
  ON users(username)
  WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active_unique
  ON users(email)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
  ON auth_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
  ON auth_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_critical_event_logs_event_type
  ON critical_event_logs(event_type);

CREATE INDEX IF NOT EXISTS idx_critical_event_logs_created_at
  ON critical_event_logs(created_at);
