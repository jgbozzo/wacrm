// ============================================================
// Shared contact logic for the public API (v1) contact endpoints.
//
// Kept out of the route files so `GET/POST /api/v1/contacts` and
// `GET/PATCH /api/v1/contacts/{id}` share one serializer, one
// find-or-create (built on the same `findExistingContact` dedupe the
// webhook and send path use), consent handling, and one tag-sync routine.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';
import { resolveImportTagIds } from '@/lib/contacts/resolve-import-tags';
import { addContactTagAndDispatch } from '@/lib/contacts/tag-events';
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils';

/** Row select that embeds the contact's tags for serialization. */
export const CONTACT_SELECT = '*, contact_tags(tags(*))';

export interface ApiContact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  avatar_url: string | null;
  whatsapp_opt_in: boolean;
  whatsapp_opt_in_at: string | null;
  whatsapp_opt_in_source: string | null;
  whatsapp_opt_in_evidence: string | null;
  whatsapp_opt_out_at: string | null;
  tags: { id: string; name: string; color: string }[];
  created_at: string;
  updated_at: string;
}

/** Thrown by the helpers below; routes map `.status`/`.message`. */
export class ContactError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ContactError';
    this.status = status;
  }
}

type RawTagJoin = { tags: { id: string; name: string; color: string } | null };

/** Flatten a `CONTACT_SELECT` row into the public contact shape. */
export function serializeContact(row: Record<string, unknown>): ApiContact {
  const joins = (row.contact_tags as RawTagJoin[] | undefined) ?? [];
  return {
    id: row.id as string,
    phone: row.phone as string,
    name: (row.name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    company: (row.company as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    whatsapp_opt_in: row.whatsapp_opt_in === true,
    whatsapp_opt_in_at: (row.whatsapp_opt_in_at as string | null) ?? null,
    whatsapp_opt_in_source:
      (row.whatsapp_opt_in_source as string | null) ?? null,
    whatsapp_opt_in_evidence:
      (row.whatsapp_opt_in_evidence as string | null) ?? null,
    whatsapp_opt_out_at: (row.whatsapp_opt_out_at as string | null) ?? null,
    tags: joins
      .map((j) => j.tags)
      .filter((t): t is NonNullable<RawTagJoin['tags']> => t != null)
      .map((t) => ({ id: t.id, name: t.name, color: t.color })),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Resolve the audit `user_id` for API-created rows — the SINGLE source
 * of truth used by every public-API write (contacts, messages,
 * broadcasts, resolve-conversation), so the same key's writes are
 * always attributed to the same human. API callers have no logged-in
 * user, so — like the inbound webhook — we attribute writes to the
 * **WhatsApp config owner** (the webhook's own convention). Contacts
 * can be created before WhatsApp is connected, so we fall back to the
 * account owner when there's no config yet.
 */
export async function resolveAuditUserId(
  db: SupabaseClient,
  accountId: string
): Promise<string> {
  const { data: config } = await db
    .from('whatsapp_config')
    .select('user_id')
    .eq('account_id', accountId)
    .maybeSingle();
  const configOwner = config?.user_id as string | undefined;
  if (configOwner) return configOwner;

  const { data: account } = await db
    .from('accounts')
    .select('owner_user_id')
    .eq('id', accountId)
    .maybeSingle();
  const owner = account?.owner_user_id as string | undefined;
  if (!owner) {
    throw new ContactError('Account owner could not be resolved', 500);
  }
  return owner;
}

export interface ContactInput {
  phone: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
}

export interface WhatsAppConsentInput {
  optedIn: boolean;
  source?: string | null;
  evidence?: string | null;
}

/**
 * Parse the public API's consent fields.
 *
 * Consent is intentionally explicit: merely creating/importing a
 * contact never opts that person in. To record an opt-in the caller
 * must send `whatsapp_opt_in: true` AND a non-empty
 * `whatsapp_opt_in_source`. The server timestamps the event so an
 * arbitrary client cannot silently backdate consent.
 *
 * Sending `whatsapp_opt_in: false` records an opt-out now. Historical
 * opt-in metadata is retained as an audit trail.
 */
export function parseWhatsAppConsentInput(
  body: Record<string, unknown>
): WhatsAppConsentInput | null {
  const hasOptIn = 'whatsapp_opt_in' in body;
  const hasSource = 'whatsapp_opt_in_source' in body;
  const hasEvidence = 'whatsapp_opt_in_evidence' in body;

  if (!hasOptIn) {
    if (hasSource || hasEvidence) {
      throw new ContactError(
        "'whatsapp_opt_in_source'/'whatsapp_opt_in_evidence' require 'whatsapp_opt_in'",
        400
      );
    }
    return null;
  }

  if (typeof body.whatsapp_opt_in !== 'boolean') {
    throw new ContactError("'whatsapp_opt_in' must be a boolean", 400);
  }

  const optedIn = body.whatsapp_opt_in;
  const source =
    typeof body.whatsapp_opt_in_source === 'string'
      ? body.whatsapp_opt_in_source.trim()
      : body.whatsapp_opt_in_source == null
        ? null
        : undefined;
  const evidence =
    typeof body.whatsapp_opt_in_evidence === 'string'
      ? body.whatsapp_opt_in_evidence.trim()
      : body.whatsapp_opt_in_evidence == null
        ? null
        : undefined;

  if (source === undefined) {
    throw new ContactError(
      "'whatsapp_opt_in_source' must be a string or null",
      400
    );
  }
  if (evidence === undefined) {
    throw new ContactError(
      "'whatsapp_opt_in_evidence' must be a string or null",
      400
    );
  }
  if (optedIn && !source) {
    throw new ContactError(
      "'whatsapp_opt_in_source' is required when opting a contact in",
      400
    );
  }

  return { optedIn, source, evidence };
}

/**
 * Record an explicit WhatsApp opt-in or opt-out for one contact.
 *
 * The update is account-scoped even when called with a service-role
 * client. Opt-in timestamps are generated server-side. Opt-out retains
 * the previous opt-in source/evidence/timestamp for audit history.
 */
export async function setWhatsAppConsent(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  input: WhatsAppConsentInput
): Promise<void> {
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = input.optedIn
    ? {
        whatsapp_opt_in: true,
        whatsapp_opt_in_at: now,
        whatsapp_opt_in_source: input.source,
        whatsapp_opt_in_evidence: input.evidence ?? null,
        updated_at: now,
      }
    : {
        whatsapp_opt_in: false,
        whatsapp_opt_out_at: now,
        updated_at: now,
      };

  const { data, error } = await db
    .from('contacts')
    .update(updates)
    .eq('id', contactId)
    .eq('account_id', accountId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[api/v1/contacts] consent update error:', error);
    throw new ContactError('Failed to update WhatsApp consent', 500);
  }
  if (!data) {
    throw new ContactError('Contact not found', 404);
  }
}

/**
 * Find (by fuzzy phone match) or create a contact in `accountId`.
 * Returns the contact id and whether it was created. Reuses the shared
 * `findExistingContact` dedupe + unique-violation race backstop so an
 * API-created contact is indistinguishable from a webhook-created one.
 */
export async function findOrCreateContact(
  db: SupabaseClient,
  accountId: string,
  auditUserId: string,
  input: ContactInput
): Promise<{ id: string; created: boolean }> {
  const sanitized = sanitizePhoneForMeta(input.phone);
  if (!isValidE164(sanitized)) {
    throw new ContactError(
      "'phone' must be a valid phone number in E.164 format (e.g. +14155550123)",
      400
    );
  }

  const existing = await findExistingContact(db, accountId, sanitized);
  if (existing) return { id: existing.id, created: false };

  const { data: created, error } = await db
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: auditUserId,
      phone: sanitized,
      name: input.name ?? sanitized,
      email: input.email ?? null,
      company: input.company ?? null,
    })
    .select('id')
    .single();

  if (error || !created) {
    // Lost a race against a concurrent create — the unique index
    // rejected the duplicate. Re-resolve to the winner.
    if (isUniqueViolation(error)) {
      const raced = await findExistingContact(db, accountId, sanitized);
      if (raced) return { id: raced.id, created: false };
    }
    console.error('[api/v1/contacts] create error:', error);
    throw new ContactError('Failed to create contact', 500);
  }

  return { id: created.id, created: true };
}

/**
 * Replace a contact's tags to exactly match `tagNames` (case-
 * insensitive; missing tags are created). Pass `[]` to clear all tags.
 * Reuses `resolveImportTagIds` so API and CSV-import tag handling stay
 * consistent — but note its `tagIdByKey` map holds EVERY tag in the
 * account (it loads them all for case-insensitive matching), so the
 * desired set must be derived from the *requested* names only, never
 * from the map's values (#560).
 */
export async function setContactTags(
  db: SupabaseClient,
  accountId: string,
  auditUserId: string,
  contactId: string,
  tagNames: string[]
): Promise<void> {
  const { tagIdByKey } = await resolveImportTagIds(db, {
    accountId,
    userId: auditUserId,
    tagNames,
    canCreateTags: true,
  });
  // Same normalization `resolveImportTagIds` applies to `tagNames`
  // (trim, lowercase, skip empty) so every requested name resolves.
  const desired = new Set<string>();
  for (const raw of tagNames) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    const tagId = tagIdByKey.get(key);
    if (tagId) desired.add(tagId);
  }

  // Diff against the current joins rather than delete-all-then-insert:
  // a diff only touches tags that actually change, so a mid-operation
  // failure can never wipe tags that were meant to stay. Every write
  // is error-checked and surfaced as a ContactError (→ 500) instead of
  // being swallowed behind a misleading 200.
  const { data: current, error: readErr } = await db
    .from('contact_tags')
    .select('tag_id')
    .eq('contact_id', contactId);
  if (readErr) {
    throw new ContactError('Failed to read contact tags', 500);
  }
  const existing = new Set(
    (current ?? []).map((r) => r.tag_id as string)
  );

  const toAdd = [...desired].filter((id) => !existing.has(id));
  const toRemove = [...existing].filter((id) => !desired.has(id));

  if (toRemove.length > 0) {
    const { error } = await db
      .from('contact_tags')
      .delete()
      .eq('contact_id', contactId)
      .in('tag_id', toRemove);
    if (error) throw new ContactError('Failed to update contact tags', 500);
  }
  if (toAdd.length > 0) {
    for (const tagId of toAdd) {
      try {
        await addContactTagAndDispatch({
          db,
          accountId,
          contactId,
          tagId,
        });
      } catch (error) {
        console.error('[api/v1/contacts] tag add failed:', error);
        throw new ContactError('Failed to update contact tags', 500);
      }
    }
  }
}

/** Fetch + serialize a single contact scoped to the account, or null. */
export async function getContactById(
  db: SupabaseClient,
  accountId: string,
  contactId: string
): Promise<ApiContact | null> {
  const { data, error } = await db
    .from('contacts')
    .select(CONTACT_SELECT)
    .eq('id', contactId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (error || !data) return null;
  return serializeContact(data as Record<string, unknown>);
}
