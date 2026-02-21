-- 在 Supabase SQL Editor 貼上後按 Run，建立店家標籤表（大家共用）

CREATE TABLE IF NOT EXISTS gym_tags (
  gym_key character varying(512) PRIMARY KEY,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb
);
