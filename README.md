# TrustLand AI Network

TrustLand AI Network is a role-based property platform built with Next.js, TypeScript, Zustand, and a T3 Agent Auth flow. It supports authenticated access, KYC-backed registration, backend property search, and role-separated dashboards for admins, buyers, and sellers.

## What It Does

- KYC-gated authentication before dashboard access
- Role-based routing for admin, buyer, and seller users
- Backend-backed property exploration and filtering
- Map-based property browsing with Google Maps fallback
- Autonomous purchase workflows for buyer users
- Stripe Payment Intents with Stripe Elements for purchase-required workflow steps
- Seller withdrawal tracking and admin finance tracking separate from buyer purchase actions
- Audit and trust ledger views for admin users

## Project Structure

- `src/app` - Next.js app router pages, layout, and API routes
- `src/components/trustland` - Dashboard, explorer, auth, and property UI
- `src/lib` - Shared store, backend data, auth helpers, and search logic

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Open the app at `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start the development server
- `npm run dev:turbo` - Start the dev server with Turbopack
- `npm run build` - Build the app for production
- `npm run start` - Start the production server
- `npm run lint` - Run ESLint

## Environment Variables

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` - Enables the live Google Maps experience in the property explorer
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Browser-safe Stripe publishable key for Elements
- `STRIPE_SECRET_KEY` - Server-only Stripe secret key used by the payment intent and webhook routes
- `STRIPE_WEBHOOK_SECRET` - Server-only Stripe webhook signing secret

## Notes

- The Explore Properties page now submits searches to `/api/properties/search` and uses the backend response as the primary data source.
- The shared filter logic in `src/lib/trustland-access.ts` powers both the UI and backend search behavior.
- Admin-only tools stay restricted, while buyers and sellers are redirected into their respective dashboard views after auth.
- The payment flow now lives inside the autonomous purchase workflow, with verified payment receipts exposed through `/payments/[paymentId]`.
- Stripe test mode works when secret and webhook keys are configured. For local development, use Stripe test cards such as `4242 4242 4242 4242` in Stripe Elements, and never paste real card numbers into code or logs.
