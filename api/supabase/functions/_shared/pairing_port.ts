// Binds the pairing state machine to Postgres. pairing.ts owns the rules;
// this file only moves rows.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./errors.ts";
import type { BadgeRow, DeviceCodeRow, PairingPort } from "./pairing.ts";

export function pgPairingPort(db: SupabaseClient): PairingPort {
  return {
    now: () => new Date(),

    async insertDeviceCode(row) {
      const { error } = await db.from("device_codes").insert(row);
      if (error) throw new ApiError(500, "internal", "could not start pairing");
    },

    async findByDeviceCodeHash(hash) {
      const { data, error } = await db
        .from("device_codes")
        .select("*")
        .eq("device_code_hash", hash)
        .maybeSingle<DeviceCodeRow>();
      if (error) throw new ApiError(500, "internal", "lookup failed");
      return data;
    },

    async findByUserCode(code) {
      const { data, error } = await db
        .from("device_codes")
        .select("*")
        .eq("user_code", code)
        .maybeSingle<DeviceCodeRow>();
      if (error) throw new ApiError(500, "internal", "lookup failed");
      return data;
    },

    async updateDeviceCode(id, patch) {
      const { error } = await db.from("device_codes").update(patch).eq("id", id);
      if (error) throw new ApiError(500, "internal", "update failed");
    },

    async upsertBadge(input) {
      // Only the current owner may rotate a badge's token. The revoke is scoped
      // to this user's own active row, so a badge held by another account is
      // left active and the badges_uid_active index makes the insert below fail
      // rather than silently displacing it. This is the pairing-hijack guard:
      // a caller who knows a uid cannot revoke someone else's badge.
      const { error: revokeError } = await db
        .from("badges")
        .update({ revoked_at: new Date().toISOString() })
        .eq("badge_uid", input.badge_uid)
        .eq("user_id", input.user_id)
        .is("revoked_at", null);
      if (revokeError) throw new ApiError(500, "internal", "could not rebind badge");

      const { data, error } = await db
        .from("badges")
        .insert({
          user_id: input.user_id,
          badge_uid: input.badge_uid,
          token_hash: input.token_hash,
        })
        .select("id, user_id, badge_uid")
        .single<BadgeRow>();
      if (error) {
        // 23505: another account still holds the active badge for this uid.
        if (error.code === "23505") {
          throw new ApiError(409, "badge_taken", "this badge is linked to another account");
        }
        throw new ApiError(500, "internal", "could not create badge");
      }
      return data;
    },

    async getProfile(userId) {
      const { data, error } = await db
        .from("profiles")
        .select("handle, display_name, avatar_url")
        .eq("id", userId)
        .maybeSingle<{
          handle: string | null;
          display_name: string | null;
          avatar_url: string | null;
        }>();
      if (error) throw new ApiError(500, "internal", "profile lookup failed");
      return data;
    },
  };
}
