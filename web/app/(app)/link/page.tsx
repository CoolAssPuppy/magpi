import { redirect } from "next/navigation";

/**
 * Kept because the badge's QR points here.
 *
 * Pairing is a dialog on the dashboard now, so this forwards and asks for it
 * to be open, carrying the scanned code through.
 */
export default async function LinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code : null;
  redirect(code ? `/dashboard?pair=1&code=${encodeURIComponent(code)}` : "/dashboard?pair=1");
}
