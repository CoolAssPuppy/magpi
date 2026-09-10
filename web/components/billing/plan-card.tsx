import { Button } from '@/components/ui/button';
import { planById, type PlanId } from '@/lib/billing/plans';

export type BillingState = {
  readonly plan: PlanId;
  readonly seats: number;
  readonly hasStripeCustomer: boolean;
  readonly isStripeConfigured: boolean;
};

/** The whole billing UI: one card and one button. Invoices and cards stay in the Stripe portal. */
export function PlanCard({ state }: { state: BillingState }) {
  const plan = planById(state.plan);

  return (
    <div className="max-w-xl rounded-[var(--radius-panel)] border border-border p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg font-medium text-foreground">{plan.name}</h2>
        <p className="text-sm text-muted-foreground">
          {plan.price}
          {plan.cadence ? <span className="text-tertiary-foreground"> {plan.cadence}</span> : null}
        </p>
      </div>

      <p className="mt-2 max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">
        {plan.summary}
      </p>

      <p className="mt-4 text-sm text-muted-foreground">
        {state.seats === 1 ? '1 seat' : `${state.seats} seats`} on this plan.
      </p>

      <div className="mt-6 border-t border-border pt-5">
        {state.isStripeConfigured ? (
          <BillingAction state={state} />
        ) : (
          <p className="text-sm text-tertiary-foreground">
            Stripe is not configured for this deployment. Set SB_STRIPE_SECRET_KEY and
            SB_STRIPE_PRICE_TEAM to turn on checkout.
          </p>
        )}
      </div>
    </div>
  );
}

function BillingAction({ state }: { state: BillingState }) {
  if (state.hasStripeCustomer) {
    return (
      <form method="post" action="/api/stripe/portal" className="flex flex-col items-start gap-2">
        <Button type="submit">Manage billing in Stripe</Button>
        <p className="text-xs text-tertiary-foreground">
          Cards, invoices, seat counts and cancellation all live in the Stripe customer portal.
        </p>
      </form>
    );
  }

  if (state.plan === 'enterprise') {
    return (
      <p className="text-sm text-muted-foreground">
        Enterprise is billed against a signed agreement. Talk to whoever set it up.
      </p>
    );
  }

  return (
    <form method="post" action="/api/stripe/checkout" className="flex flex-col items-start gap-2">
      <Button type="submit">Upgrade to Team</Button>
      <p className="text-xs text-tertiary-foreground">
        Checkout runs on Stripe. Your plan changes when Stripe confirms the payment.
      </p>
    </form>
  );
}
