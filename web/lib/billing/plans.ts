import type { Database } from '@/lib/database.types';

export type PlanId = Database['public']['Enums']['org_plan'];
export type SpaceKind = Database['public']['Enums']['space_kind'];

/** How a visitor starts on this plan: already on it, Stripe Checkout, or a sales contact. */
export type PlanSignup = 'current' | 'checkout' | 'contact';

export type Plan = {
  readonly id: PlanId;
  readonly name: string;
  readonly price: string;
  readonly cadence: string | null;
  readonly summary: string;
  readonly spaceKinds: readonly SpaceKind[];
  readonly allowsConnections: boolean;
  readonly features: readonly string[];
  readonly signup: PlanSignup;
};

/** Copy and shape only. Enforced limits come from the plan_*_limit functions in the database. */
export const PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    summary: 'One personal space, so you can see whether it answers your questions.',
    spaceKinds: ['personal'],
    allowsConnections: false,
    features: [
      'Your personal space',
      'Upload documents directly',
      'Chat with citations back to the source',
      'Nightly dreaming',
    ],
    signup: 'current',
  },
  {
    id: 'team',
    name: 'Team',
    price: '$20',
    cadence: 'per person, per month',
    summary: 'Team and organization spaces, and the connections that fill them.',
    spaceKinds: ['personal', 'team', 'org'],
    allowsConnections: true,
    features: [
      'Everything in Free',
      'Team and organization spaces',
      'Notion, Linear, Slack and Google Drive connections',
      'Admin analytics: ingest health, search volume, dead content',
    ],
    signup: 'checkout',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Talk to us',
    cadence: null,
    summary: 'Volume pricing, a signed agreement, and a person who answers.',
    spaceKinds: ['personal', 'team', 'org'],
    allowsConnections: true,
    features: [
      'Everything in Team',
      'Volume document and query limits',
      'Security review and a signed agreement',
      'Priority support',
    ],
    signup: 'contact',
  },
];

export function planById(id: PlanId): Plan {
  const plan = PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`no such plan: ${id}`);
  return plan;
}

/** The Stripe prices this deployment sells, read from the environment. */
export type PriceMap = { readonly teamPriceId: string };
