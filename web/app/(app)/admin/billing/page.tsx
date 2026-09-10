import { Panel } from '@/components/admin/panel';
import { SectionHeader } from '@/components/admin/section-header';
import { ErrorState } from '@/components/app/error-state';
import { PlanCard } from '@/components/billing/plan-card';
import { resolveAdminAccess } from '@/lib/analytics/access';
import { isBillingConfigured } from '@/lib/billing/config';

const BILLING_ERRORS: Record<string, string> = {
  'signed-out': 'Your session expired before Stripe could be reached. Sign in and try again.',
  'not-admin': 'Only an owner or an admin can change the plan.',
  'check-failed':
    'Your role could not be confirmed, so nothing was sent to Stripe. Try again in a moment.',
  'no-customer': 'This organization has no Stripe customer yet. Start a subscription first.',
  'no-organization': 'This organization could not be read, so nothing was sent to Stripe.',
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; checkout?: string }>;
}) {
  const access = await resolveAdminAccess();
  if (access.kind !== 'granted') return null;

  const params = await searchParams;

  const { data: organization, error } = await access.context.supabase
    .from('organizations')
    .select('plan, seats, stripe_customer_id')
    .eq('id', access.context.orgId)
    .single();

  if (error || !organization) {
    return (
      <ErrorState
        title="The plan did not load"
        detail="Nothing was charged and nothing changed. Try again in a moment."
      />
    );
  }

  const message = params.error ? BILLING_ERRORS[params.error] : undefined;

  return (
    <div className="flex flex-col gap-10">
      <SectionHeader title="Billing and payment" />

      {message ? <ErrorState title="Billing did not go through" detail={message} /> : null}

      {params.checkout === 'complete' ? (
        <p className="rounded-[var(--radius-panel)] border border-border-brand bg-brand-200 p-4 text-sm text-brand-600">
          Stripe has your payment. The plan updates here when Stripe confirms the subscription.
        </p>
      ) : null}

      <Panel title="Plan">
        <PlanCard
          state={{
            plan: organization.plan,
            seats: organization.seats,
            hasStripeCustomer: organization.stripe_customer_id !== null,
            isStripeConfigured: isBillingConfigured(),
          }}
        />
      </Panel>
    </div>
  );
}
