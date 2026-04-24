-- Add invite code to rooms (nullable — generated on demand)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- Invitations table — tracks pending invites by username or email
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_username TEXT NOT NULL,
  accepted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_room_id ON invitations(room_id);
CREATE INDEX IF NOT EXISTS idx_invitations_username ON invitations(invited_username);