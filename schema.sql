-- ============================================================
-- YouTube Roulette — Supabase Schema
-- Run this in your Supabase SQL Editor (one time setup)
-- These tables are prefixed with yt_ to avoid conflicts
-- ============================================================

-- Rooms table: stores game/room state
CREATE TABLE IF NOT EXISTS yt_rooms (
  code TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby',
  is_hub BOOLEAN DEFAULT false,
  current_player_index INTEGER DEFAULT 0,
  current_search_term TEXT,
  round INTEGER DEFAULT 1,
  win_score INTEGER DEFAULT 3,
  player_order TEXT[] DEFAULT ARRAY[]::TEXT[],
  past_terms TEXT[] DEFAULT ARRAY[]::TEXT[],
  search_results JSONB DEFAULT '[]'::JSONB,
  selected_video_index INTEGER,
  selected_video_id TEXT,
  playback_status TEXT DEFAULT 'idle',
  videos JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Players table: stores per-player state within a room
CREATE TABLE IF NOT EXISTS yt_players (
  id TEXT NOT NULL,
  room_code TEXT NOT NULL REFERENCES yt_rooms(code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ready BOOLEAN DEFAULT false,
  score INTEGER DEFAULT 0,
  has_reroll BOOLEAN DEFAULT true,
  has_replace BOOLEAN DEFAULT true,
  has_swap BOOLEAN DEFAULT true,
  selected_video TEXT,
  vote_for TEXT,
  picked_video_id TEXT,
  picked_video_title TEXT,
  picked_video_thumbnail TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, room_code)
);

-- Enable Row Level Security with open policies (no auth needed for this game)
ALTER TABLE yt_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE yt_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "yt_rooms_all_access" ON yt_rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "yt_players_all_access" ON yt_players FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime on both tables
ALTER PUBLICATION supabase_realtime ADD TABLE yt_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE yt_players;
