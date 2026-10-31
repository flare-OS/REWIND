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
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','neptune','pluto','supernova'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS orbs INTEGER NOT NULL DEFAULT 0 CHECK (orbs >= 0);
ALTER TABLE users ALTER COLUMN orbs TYPE BIGINT USING orbs::bigint;
ALTER TABLE users ADD COLUMN IF NOT EXISTS play_seconds BIGINT NOT NULL DEFAULT 0 CHECK (play_seconds >= 0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_orb_claim DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS starcode TEXT UNIQUE;

-- The requested creator account receives the full owner role when registered.
UPDATE users SET role='owner' WHERE username_key='lunastral';

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS news_posts (
  id UUID PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  summary TEXT NOT NULL DEFAULT '' CHECK (char_length(summary) <= 300),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS news_posts_published_idx ON news_posts(published_at DESC) WHERE published_at IS NOT NULL;

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
  visits BIGINT NOT NULL DEFAULT 0 CHECK (visits >= 0),
  scene JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

ALTER TABLE places ADD COLUMN IF NOT EXISTS requires_supervision BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE places ADD COLUMN IF NOT EXISTS visits BIGINT NOT NULL DEFAULT 0;
ALTER TABLE places ADD COLUMN IF NOT EXISTS privacy TEXT NOT NULL DEFAULT 'private' CHECK (privacy IN ('public','private','friends'));
UPDATE places SET privacy=CASE WHEN published THEN 'public' ELSE 'private' END WHERE published=true AND privacy='private';

CREATE INDEX IF NOT EXISTS places_owner_id_idx ON places(owner_id);
CREATE INDEX IF NOT EXISTS places_published_idx ON places(published, updated_at DESC);

CREATE TABLE IF NOT EXISTS place_activity (
  id UUID PRIMARY KEY,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS place_activity_recent_idx ON place_activity(place_id,created_at DESC);

CREATE TABLE IF NOT EXISTS gamepasses (
  id UUID PRIMARY KEY,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon_asset_id UUID,
  price_orbs INTEGER NOT NULL CHECK (price_orbs>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS gamepasses_place_idx ON gamepasses(place_id,active,created_at DESC);

CREATE TABLE IF NOT EXISTS gamepass_ownership (
  gamepass_id UUID NOT NULL REFERENCES gamepasses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price_orbs INTEGER NOT NULL,
  PRIMARY KEY(gamepass_id,user_id)
);

-- Keep the Orb debit and entitlement grant atomic. Locking the buyer first
-- serializes concurrent purchases from the same account.
CREATE OR REPLACE FUNCTION rewind_purchase_gamepass(p_user_id UUID, p_gamepass_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  pass_row gamepasses%ROWTYPE;
  buyer_orbs BIGINT;
BEGIN
  SELECT * INTO pass_row
  FROM gamepasses
  WHERE id = p_gamepass_id AND active = TRUE;
  IF NOT FOUND THEN RETURN 'unavailable'; END IF;

  SELECT orbs INTO buyer_orbs FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM gamepass_ownership WHERE gamepass_id = p_gamepass_id AND user_id = p_user_id) THEN
    RETURN 'owned';
  END IF;
  IF buyer_orbs < pass_row.price_orbs THEN RETURN 'insufficient'; END IF;

  UPDATE users SET orbs = orbs - pass_row.price_orbs WHERE id = p_user_id;
  INSERT INTO gamepass_ownership(gamepass_id,user_id,price_orbs)
  VALUES(p_gamepass_id,p_user_id,pass_row.price_orbs);
  RETURN 'purchased';
END;
$$;

CREATE TABLE IF NOT EXISTS experience_badges (
  id UUID PRIMARY KEY,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon_asset_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS experience_badges_place_idx ON experience_badges(place_id,active,created_at DESC);

CREATE TABLE IF NOT EXISTS badge_awards (
  badge_id UUID NOT NULL REFERENCES experience_badges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  awarded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(badge_id,user_id)
);

CREATE TABLE IF NOT EXISTS friendships (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,friend_id),
  CHECK(user_id<>friend_id)
);

CREATE TABLE IF NOT EXISTS place_scripts (
  id UUID PRIMARY KEY,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  script_type TEXT NOT NULL CHECK (script_type IN ('client','server')),
  source TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(place_id,name,script_type)
);

CREATE TABLE IF NOT EXISTS place_datastore (
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  data_key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(place_id,store_name,data_key)
);

CREATE TABLE IF NOT EXISTS place_sessions (
  id UUID PRIMARY KEY,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(place_id,user_id)
);
CREATE INDEX IF NOT EXISTS place_sessions_live_idx ON place_sessions(place_id,last_seen_at);
CREATE TABLE IF NOT EXISTS experience_runtime (
  place_id UUID PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  seconds BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('user','place','asset')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status,created_at DESC);

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
