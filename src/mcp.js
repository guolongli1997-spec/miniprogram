// MCP tool definitions for FlyTripVisa AI agents (Cloudflare agents SDK style).
// These tool specs can be registered with an MCP server so external AI clients
// (Claude, Cursor, etc.) can query FlyTripVisa services.

export const FLYTRIP_TOOLS = [
  {
    name: 'flytrip_get_services',
    description:
      'List FlyTripVisa services: visa consultancy, flight booking, hotels, eSIM data plans and business setup.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => ({
      services: [
        { id: 'visa', name: 'Visa Consultancy', destinations: ['Dubai/UAE', 'China', 'Malaysia', 'Saudi Arabia', 'Europe/Schengen'] },
        { id: 'flights', name: 'Flight Ticketing', scope: 'worldwide' },
        { id: 'hotels', name: 'Hotel Stays', scope: 'worldwide' },
        { id: 'esim', name: 'Instant eSIM', countries: '150+', delivery: 'QR code, instant' },
        { id: 'business', name: 'Business Setup', regions: ['UAE', 'China', 'Malaysia'] },
      ],
    }),
  },
  {
    name: 'flytrip_get_esim_plans',
    description: 'Get popular FlyTripVisa eSIM data plans and prices in USD.',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string', description: 'Destination country, e.g. "UAE"' },
      },
      required: [],
    },
    handler: async ({ country } = {}) => {
      const plans = [
        { country: 'UAE / Dubai', data: '10 GB', days: 30, price: 29 },
        { country: 'China', data: '15 GB', days: 15, price: 35 },
        { country: 'Saudi Arabia', data: '20 GB', days: 30, price: 32 },
        { country: 'Asia Regional', data: '50 GB', days: 30, price: 49 },
      ];
      const c = (country || '').toLowerCase();
      return c ? plans.filter((p) => p.country.toLowerCase().includes(c)) : plans;
    },
  },
  {
    name: 'flytrip_get_visa_info',
    description: 'Get visa requirements, processing time and starting price for a destination.',
    inputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Destination, e.g. "Dubai"' },
      },
      required: ['destination'],
    },
    handler: async ({ destination } = {}) => ({
      destination,
      processing_time: '24-72 hours',
      price_from: 59,
      currency: 'USD',
      documents: ['Passport scan (valid 6+ months)', 'Passport photo', 'Flight booking optional'],
      apply_url: 'https://wa.me/message/SD44CN7CQKC7K1',
    }),
  },
];

export function listTools() {
  return FLYTRIP_TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}

export async function callTool(name: string, args: Record<string, unknown>) {
  const tool = FLYTRIP_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(args);
}
