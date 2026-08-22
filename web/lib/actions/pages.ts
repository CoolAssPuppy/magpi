import { z } from "zod";

import { PAGE_SLUGS } from "@/lib/badge-constants";
import {
  isKnownPageSlug,
  setPageEnabled,
  setPageOrder,
  setPageSettings,
  type DbClient,
} from "@/lib/db";

import { errorState, successState, type ActionState } from "./state";

const slugSchema = z.enum(PAGE_SLUGS);

const toggleSchema = z.object({
  page_slug: slugSchema,
  enabled: z.stringbool(),
});

const reorderSchema = z.object({
  // One field carrying the whole order, because a partial order is not an
  // order. The form posts it as a comma separated list of slugs.
  order: z.string().transform((value) => value.split(",").filter(Boolean)),
});

const UNKNOWN_PAGE = "That is not a page this badge can draw.";
const SAVE_FAILED = "That did not save. Try again.";

export async function togglePage(
  client: DbClient,
  userId: string,
  form: FormData,
): Promise<ActionState> {
  const parsed = toggleSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return errorState(UNKNOWN_PAGE);

  const result = await setPageEnabled(client, userId, parsed.data.page_slug, parsed.data.enabled);
  if (!result.ok) return errorState(SAVE_FAILED);
  return successState(parsed.data.enabled ? "Page turned on." : "Page turned off.");
}

/**
 * The whole order, rewritten in one write.
 *
 * Every slug is checked against what the device can draw before anything is
 * written: a reorder is the one action that touches every row, so a bad slug
 * here would put an unknown page in front of the ones that work.
 */
export async function reorderPages(
  client: DbClient,
  userId: string,
  form: FormData,
): Promise<ActionState> {
  const parsed = reorderSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return errorState(UNKNOWN_PAGE);

  const slugs = parsed.data.order;
  if (slugs.length === 0) return errorState(UNKNOWN_PAGE);
  if (!slugs.every(isKnownPageSlug)) return errorState(UNKNOWN_PAGE);
  if (new Set(slugs).size !== slugs.length) return errorState(UNKNOWN_PAGE);

  const result = await setPageOrder(client, userId, slugs);
  if (!result.ok) return errorState(SAVE_FAILED);
  return successState("Order saved.");
}

/**
 * Per-page settings, kept as free-form JSON.
 *
 * The shape is the page builder's business rather than this function's, so
 * every value is stored as it arrives and each builder reads what it knows.
 * Adding a setting is a change to one builder and one form.
 */
export async function configurePage(
  client: DbClient,
  userId: string,
  form: FormData,
): Promise<ActionState> {
  const entries = Object.fromEntries(form);
  const slug = slugSchema.safeParse(entries.page_slug);
  if (!slug.success) return errorState(UNKNOWN_PAGE);

  const settings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (key === "page_slug") continue;
    settings[key] = coerce(value);
  }

  const result = await setPageSettings(client, userId, slug.data, settings);
  if (!result.ok) return errorState(SAVE_FAILED);
  return successState("Saved.");
}

/** A form field is always a string; a builder wants the value it meant. */
function coerce(value: FormDataEntryValue): unknown {
  if (typeof value !== "string") return null;
  if (value === "on" || value === "true") return true;
  if (value === "off" || value === "false") return false;
  if (value === "") return null;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) && value.trim() !== "" ? asNumber : value;
}
