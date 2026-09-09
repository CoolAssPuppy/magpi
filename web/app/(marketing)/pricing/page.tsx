import { PricingTable } from '@/components/billing/pricing-table';

export const metadata = {
  title: 'Pricing | Recall',
  description: 'Free for one personal space. Team is per person, per month.',
};

export default function PricingPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-5 py-20">
      <section className="max-w-[var(--measure-prose)]">
        <h1 className="font-heading text-4xl leading-[1.1] font-medium tracking-tight text-foreground">
          Pay for the team, not the documents.
        </h1>
        <p className="mt-5 text-base text-foreground-light">
          Every plan reads the same way and answers with the same citations. What changes is how
          many people you can bring, and whether Recall goes and fetches your sources for you.
        </p>
      </section>

      <PricingTable />

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium text-foreground">Questions people ask</h2>
        <dl className="grid gap-8 md:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-foreground">What counts as a question?</dt>
            <dd className="mt-1.5 max-w-[var(--measure-prose)] text-sm text-foreground-lighter">
              One answered turn in chat. Follow-ups count, because each one runs a search.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-foreground">What happens at the limit?</dt>
            <dd className="mt-1.5 max-w-[var(--measure-prose)] text-sm text-foreground-lighter">
              New ingest is refused and everything already in Recall keeps answering. The check runs
              in the database, so it is the same answer everywhere.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-foreground">Can I cancel?</dt>
            <dd className="mt-1.5 max-w-[var(--measure-prose)] text-sm text-foreground-lighter">
              In the Stripe customer portal, in two clicks. Your organization drops back to Free and
              your documents stay where they are.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-foreground">Is it really open source?</dt>
            <dd className="mt-1.5 max-w-[var(--measure-prose)] text-sm text-foreground-lighter">
              MIT, the whole thing, including this billing code. Run it yourself and pay nobody.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
