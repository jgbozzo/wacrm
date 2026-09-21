-- ============================================================
-- 041_whatsapp_consent.sql — WhatsApp consent / opt-in tracking
--
-- Adds explicit account-level contact consent fields used by the
-- security-hardening work. Existing contacts default to NOT opted in:
-- no historical phonebook/import row is silently treated as consent.
--
-- Semantics
--   whatsapp_opt_in
--     Current permission state for proactive WhatsApp messaging.
--
--   whatsapp_opt_in_at
--     Timestamp of the most recent valid opt-in. Required whenever
--     whatsapp_opt_in = true.
--
--   whatsapp_opt_in_source
--     Where the consent was collected (for example: website_form,
--     inbound_whatsapp, checkout, paper_form, manual_verified).
--
--   whatsapp_opt_in_evidence
--     Human-readable evidence/reference supporting the opt-in. This is
--     deliberately TEXT rather than a rigid enum/JSON schema so an
--     operator can store a form submission id, source URL, campaign
--     reference, signed-form note, or equivalent evidence.
--
--   whatsapp_opt_out_at
--     Timestamp of the most recent opt-out, if any.
--
-- A contact may opt back in after opting out. In that case
-- whatsapp_opt_in = true is allowed only when whatsapp_opt_in_at is
-- later than whatsapp_opt_out_at.
--
-- This migration changes schema only. It does NOT yet change broadcast
-- or message-send behaviour; enforcement is added in later commits.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_source text,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_evidence text,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at timestamptz;

-- A current opt-in must always carry a timestamp so the system can
-- demonstrate when permission was obtained.
ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_whatsapp_opt_in_requires_timestamp;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_whatsapp_opt_in_requires_timestamp
  CHECK (
    whatsapp_opt_in = false
    OR whatsapp_opt_in_at IS NOT NULL
  );

-- If a previous opt-out exists, a current opt-in is valid only when the
-- recorded re-opt-in happened after that opt-out.
ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_whatsapp_opt_in_after_opt_out;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_whatsapp_opt_in_after_opt_out
  CHECK (
    whatsapp_opt_in = false
    OR whatsapp_opt_out_at IS NULL
    OR whatsapp_opt_in_at > whatsapp_opt_out_at
  );

-- Broadcast/contact selectors will frequently ask for opted-in contacts
-- inside one account. A partial index keeps that path cheap without
-- indexing every non-consenting historical/imported contact.
CREATE INDEX IF NOT EXISTS idx_contacts_account_whatsapp_opt_in
  ON contacts (account_id, whatsapp_opt_in_at DESC)
  WHERE whatsapp_opt_in = true;

COMMENT ON COLUMN contacts.whatsapp_opt_in IS
  'Current explicit permission for proactive WhatsApp messaging. Defaults false; never infer consent from contact existence alone.';

COMMENT ON COLUMN contacts.whatsapp_opt_in_at IS
  'Timestamp of the most recent valid WhatsApp opt-in. Required when whatsapp_opt_in is true.';

COMMENT ON COLUMN contacts.whatsapp_opt_in_source IS
  'Where WhatsApp consent was collected (form, inbound conversation, checkout, manual verification, etc.).';

COMMENT ON COLUMN contacts.whatsapp_opt_in_evidence IS
  'Operator-readable evidence/reference supporting the recorded WhatsApp opt-in.';

COMMENT ON COLUMN contacts.whatsapp_opt_out_at IS
  'Timestamp of the most recent WhatsApp opt-out, if any.';
