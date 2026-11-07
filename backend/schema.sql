-- =========================================================
-- FRND PLATFORM DATABASE SCHEMA (PostgreSQL)
-- =========================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'NORMAL',
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  city TEXT,
  latitude FLOAT8,
  longitude FLOAT8,
  is_verified BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  wallet_balance INTEGER DEFAULT 0,
  is_premium BOOLEAN DEFAULT false,
  celebrity_details JSONB,
  organization_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Celebrity Feed Posts
CREATE TABLE IF NOT EXISTS celebrity_posts (
  id TEXT PRIMARY KEY,
  celebrity_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Call History
CREATE TABLE IF NOT EXISTS call_history (
  id TEXT PRIMARY KEY,
  call_type TEXT NOT NULL,
  caller_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  receiver_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  caller_name TEXT,
  receiver_name TEXT,
  status TEXT DEFAULT 'ENDED',
  duration_seconds INTEGER DEFAULT 0,
  rate_per_minute INTEGER DEFAULT 0,
  total_billed INTEGER DEFAULT 0,
  has_video BOOLEAN DEFAULT false,
  rating INTEGER DEFAULT 5,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- 4. Events
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  organizer_id TEXT REFERENCES users(id),
  organizer_name TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  banner_url TEXT,
  venue_name TEXT,
  address TEXT,
  city TEXT,
  latitude FLOAT8,
  longitude FLOAT8,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  ticket_tiers JSONB DEFAULT '[]',
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Ticket Bookings
CREATE TABLE IF NOT EXISTS ticket_bookings (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id),
  event_title TEXT,
  user_id TEXT REFERENCES users(id),
  user_name TEXT,
  user_phone TEXT,
  tier_id TEXT,
  tier_name TEXT,
  quantity INTEGER DEFAULT 1,
  total_amount INTEGER,
  qr_code_hash TEXT,
  is_used BOOLEAN DEFAULT false,
  booked_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  user_name TEXT,
  user_role TEXT,
  user_phone TEXT,
  status TEXT DEFAULT 'WAITING',
  assigned_agent_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Support Messages
CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id TEXT REFERENCES users(id),
  sender_role TEXT,
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Direct 1-on-1 Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT REFERENCES users(id),
  receiver_id TEXT REFERENCES users(id),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. VIP Fan Passes
CREATE TABLE IF NOT EXISTS vip_fan_passes (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  celebrity_id TEXT REFERENCES users(id),
  amount INTEGER DEFAULT 499,
  is_active BOOLEAN DEFAULT true,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(user_id, celebrity_id)
);

-- 10. Call Quality Reviews & Bug Feedback (Super Admin Monitoring)
CREATE TABLE IF NOT EXISTS call_quality_reviews (
  id TEXT PRIMARY KEY,
  call_id TEXT,
  caller_id TEXT,
  caller_name TEXT,
  celebrity_id TEXT,
  celebrity_name TEXT,
  rating INTEGER NOT NULL DEFAULT 5,
  call_type TEXT DEFAULT 'CELEBRITY_VIDEO',
  issue_tags JSONB DEFAULT '[]',
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_call_history_caller    ON call_history(caller_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_receiver  ON call_history(receiver_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_city_start      ON events(city, start_time);
CREATE INDEX IF NOT EXISTS idx_chat_messages_pair     ON chat_messages(sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user   ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_vip_passes_user_celeb  ON vip_fan_passes(user_id, celebrity_id);
CREATE INDEX IF NOT EXISTS idx_call_quality_reviews_created ON call_quality_reviews(created_at DESC);
