export interface PlanDefinition {
  id: 'hatchling' | 'lobster' | 'leviathan';
  name: string;
  price: number;        // Monthly price in USD (0 for free)
  quota: number;        // Monthly API call limit
  rateLimit: string;    // Human-readable rate limit
  overage: string | null; // Overage note, null for free tier
  featured: boolean;    // Whether this card is visually elevated
}

export const PLANS: PlanDefinition[] = [
  {
    id: 'hatchling',
    name: 'Hatchling',
    price: 0,
    quota: 1_000,
    rateLimit: '30 req/min',
    overage: null,
    featured: false,
  },
  {
    id: 'lobster',
    name: 'Lobster',
    price: 29,
    quota: 100_000,
    rateLimit: '300 req/min',
    overage: 'Requests blocked at quota limit*',
    featured: true,
  },
  {
    id: 'leviathan',
    name: 'Leviathan',
    price: 149,
    quota: 10_000_000,
    rateLimit: '3,000 req/min',
    overage: 'Requests blocked at quota limit*',
    featured: false,
  },
];
