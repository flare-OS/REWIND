CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'owner', 'asset_mod')),
  avatar JSONB NOT NULL DEFAULT '{}'::jsonb,
  date_of_birth DATE,
  terms_accepted_at TIMESTAMPTZ,
  terms_version TEXT,
  privacy_acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_acknowledged_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS supervision_links (
  id UUID PRIMARY KEY,
  child_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  supervisor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  supervisor_attested BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS supervision_links_supervisor_idx ON supervision_links(supervisor_user_id, status);

CREATE TABLE IF NOT EXISTS places (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT 'All',
  requires_supervision BOOLEAN NOT NULL DEFAULT FALSE,
  icon_asset_id UUID,
  thumbnail_asset_id UUID,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  scene JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

ALTER TABLE places ADD COLUMN IF NOT EXISTS requires_supervision BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS places_owner_id_idx ON places(owner_id);
CREATE INDEX IF NOT EXISTS places_published_idx ON places(published, updated_at DESC);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('game_icon', 'game_thumbnail', 'model', 'audio', 'decal')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  object_key TEXT NOT NULL UNIQUE,
  public_url TEXT,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assets_status_idx ON assets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS assets_owner_id_idx ON assets(owner_id);

ALTER TABLE places
  DROP CONSTRAINT IF EXISTS places_icon_asset_id_fkey,
  ADD CONSTRAINT places_icon_asset_id_fkey FOREIGN KEY (icon_asset_id) REFERENCES assets(id) ON DELETE SET NULL;

ALTER TABLE places
  DROP CONSTRAINT IF EXISTS places_thumbnail_asset_id_fkey,
  ADD CONSTRAINT places_thumbnail_asset_id_fkey FOREIGN KEY (thumbnail_asset_id) REFERENCES assets(id) ON DELETE SET NULL;
