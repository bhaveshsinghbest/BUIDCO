-- 0020: session binding and absolute session lifetime (security finding S-15).
--
-- A sign-in now creates one session id that every refresh token in its
-- rotation chain shares. Access tokens carry the id (claim "sid") and the
-- API accepts them only while the session still has a live refresh_token
-- row, so logout, a password reset, refresh-token reuse detection and the
-- absolute lifetime (SESSION_MAX_AGE_SECONDS) cut access off immediately
-- instead of up to one access-token lifetime later.
--
-- Additive and backward compatible: rows issued before this migration keep
-- NULLs and are adopted into a new session on their next refresh.

ALTER TABLE refresh_token ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE refresh_token ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ;

-- requireAuth looks up "a live row of this session" on every API request.
CREATE INDEX IF NOT EXISTS idx_refresh_token_live_session
  ON refresh_token (session_id)
  WHERE revoked_at IS NULL;
