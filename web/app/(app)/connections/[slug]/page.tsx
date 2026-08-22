import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ErrorPanel } from "@/components/empty-state";
import { getProvider, listConnections } from "@/lib/queries";

import { ApiKeyForm, AuthorizeForm, DisconnectForm } from "./detail-forms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const provider = await getProvider(slug);
  return { title: provider ? `${provider.display_name} connection` : "Connection" };
}

/** Which pages stop drawing when this provider goes. */
const USED_BY: Record<string, string[]> = {
  google: ["Next thing", "Day shape", "Counters"],
  vercel: ["Deploy state"],
  posthog: ["One number"],
  linear: ["Counters"],
  slack: ["Counters"],
  github: ["Counters"],
};

export default async function ConnectionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [provider, connections] = await Promise.all([getProvider(slug), listConnections()]);
  if (!provider) notFound();

  const connection = connections.find((row) => row.provider === slug);
  const isConnected = Boolean(connection);
  const hasError = connection?.status === "error";

  return (
    <AppShell current="/connections" title={provider.display_name}>
      <div className="gap-xl flex max-w-[720px] flex-col">
        <nav className="gap-sm font-display text-ink-faint flex items-center text-sm">
          <Link href="/connections" className="hover:text-ink">
            Connections
          </Link>
          <span>/</span>
          <span className="text-ink">{provider.display_name}</span>
        </nav>

        <header className="gap-md flex items-center">
          <span
            className={
              hasError
                ? "size-md rounded-pill bg-critical"
                : isConnected
                  ? "size-md rounded-pill bg-accent"
                  : "size-md rounded-pill bg-border-strong"
            }
          />
          <h2 className="font-display text-2xl font-bold">{provider.display_name}</h2>
          <span
            className={
              hasError
                ? "rounded-hairline bg-critical px-sm py-3xs font-display text-2xs tracking-label text-chalk-50"
                : isConnected
                  ? "rounded-hairline bg-sheen-800 px-sm py-3xs font-display text-2xs tracking-label text-sheen-300"
                  : "rounded-hairline border-border px-sm py-3xs font-display text-2xs tracking-label text-ink-faint border"
            }
          >
            {hasError ? "NEEDS RECONNECTING" : isConnected ? "CONNECTED" : "NOT CONNECTED"}
          </span>
        </header>

        <p className="text-md leading-prose text-ink-muted">{provider.description}</p>

        {hasError && connection?.error_message ? (
          <ErrorPanel
            kicker="THIS PROVIDER REFUSED US"
            heading={connection.error_message}
            body={`${(USED_BY[slug] ?? []).join(", ") || "Nothing"} stopped drawing on the badge. Every other page is unaffected.`}
          />
        ) : null}

        <dl className="rounded-panel border-border bg-surface flex flex-col overflow-hidden border">
          <Fact label="KIND" value={provider.kind === "oauth" ? "OAuth" : "API key"} />
          {connection?.external_account ? (
            <Fact label="ACCOUNT" value={connection.external_account} />
          ) : null}
          {provider.scopes.length > 0 ? (
            <Fact label="SCOPES" value={provider.scopes.join("  ")} mono />
          ) : null}
          <Fact label="PAGES USING THIS" value={(USED_BY[slug] ?? []).join(", ") || "None yet"} />
          {provider.docs_url ? <Fact label="DOCS" value={provider.docs_url} mono /> : null}
        </dl>

        {provider.kind === "oauth" ? (
          <AuthorizeForm provider={slug} isConnected={isConnected} />
        ) : (
          <ApiKeyForm provider={slug} />
        )}

        {isConnected ? <DisconnectForm provider={slug} /> : null}
      </div>
    </AppShell>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-border px-lg py-md flex items-center border-b last:border-b-0">
      <dt className="font-display text-2xs text-ink-faint w-[190px] shrink-0 tracking-wide">
        {label}
      </dt>
      <dd className={mono ? "font-display flex-1 text-sm" : "flex-1 text-base"}>{value}</dd>
    </div>
  );
}
