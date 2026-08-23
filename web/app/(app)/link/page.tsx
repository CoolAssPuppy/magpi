import { redirect } from "next/navigation";

import { pairingPath } from "@/lib/redirects";

/**
 * Kept because the badge's QR points here.
 *
 * Pairing is a dialog on the badges screen now, so this forwards, carrying
 * the scanned code through and asking for the dialog only when there is one.
 */
export default async function LinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code : null;
  redirect(pairingPath(code));
}
