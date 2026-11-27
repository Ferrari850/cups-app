# Cups: cafe management

A phone-friendly web app for running the cafe, in English and Arabic:

- **Schedule:** weekly shifts, "copy last week", hours per person, and shift swaps (staff ask a colleague, the colleague accepts, a manager approves).
- **Events:** special events with assigned staff and duties. Staff get a notification, and managers can see who has seen it.
- **Invoices:** take one or several photos (or upload a PDF). Claude reads the supplier, items and prices (Arabic or English, AED). You check each line, link it to an ingredient once, and the app remembers it next time. When the same ingredient's price changes, owners and managers get an alert.
- **Menu costs:** each menu item has a recipe page. Ingredient costs come from the latest invoice prices, so you see the cost per portion, margin and cost % of the selling price (before VAT).

Roles: **owner** (everything, the only one who can make managers), **manager** (everything except changing roles), **staff** (own schedule, swaps, events).

## Setup

### 1. Supabase (database, logins, invoice photos)
1. Create a new project in Supabase.
2. Open **SQL Editor**, paste the whole of `supabase/migrations/0001_init.sql`, and press **Run**.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". Staff accounts are created from the app's Team page.
4. **Authentication → Users → Add user**: create your own account (email + password, tick "Auto confirm"). The first account becomes the **owner**.
5. **Project Settings → API**: copy the Project URL, the `anon` key and the `service_role` key for step 2.

### 2. Vercel (hosting)
1. **Add New → Project**, import `cups-app` from GitHub.
2. Add these environment variables (see `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY` (from console.anthropic.com → API keys)
3. Deploy. Open the site on your phone and choose **Add to Home Screen**.

### 3. In the app
1. Sign in, open **More → Team**, and add your staff. Each person gets a temporary password to give them.
2. Build the first week's schedule. Next week, use **Copy last week here**.

### 4. Point of sale (POS)
1. **Database update (once):** in Supabase **SQL Editor**, paste the whole of `supabase/migrations/0002_pos.sql` and press **Run**. It runs all or nothing.
2. **More → Receipt & printer:** cafe name, address, TRN (receipts then print as Tax Invoice) and, once you have it, the Epson printer's IP address.
3. **More → Prices per platform:** items without a menu price can't be sold. Type prices on each menu item, or use **Fill prices** (recipe cost ÷ 30%, plus VAT, rounded up to 0.50).
4. **More → Channels & apps:** check each app's price multiplier, rounding and commission %.
5. **More → Add-ons:** milk choices, extra shots, Extra Acai… link each to the stock item it uses.
6. **Profile → Manager PIN:** managers set a PIN to approve refunds on a cashier's tablet.
7. On the counter tablets open **/pos** (POS) and **/bar** (bar display), and add both to the home screen.

How it fits together: every sale is priced by the database from the menu and channel rule, takes stock out by recipe (and add-ons), and records cash, card or app payment against the open cash drawer. Confirmed invoices put stock in. Weekly counts and waste correct it.

## Development

```bash
npm install
cp .env.example .env.local   # fill in the values
npx supabase start           # optional: local database (needs Docker)
npm run dev
```

Invoice reading lives in `src/lib/invoice-reader.ts` and `src/app/api/invoices/[id]/read/route.ts`. The model can be changed with the `INVOICE_MODEL` environment variable.
