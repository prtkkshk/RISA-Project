# Deploy in about 15 minutes (Supabase + Vercel + OpenAI)

You need free accounts on GitHub, Supabase and Vercel, plus an OpenAI API key with a few dollars of credit.

## 1. OpenAI key
1. Go to platform.openai.com → **API keys** → **Create new secret key**. Copy it somewhere safe.
2. Go to **Billing** and add about $5 of credit. Under **Limits**, set a monthly budget, for example $10, so reviewers can't run up a bill.

## 2. Supabase database
1. Go to supabase.com → **New project**. Name it `risa-sponsor`, choose region **South Asia (Mumbai)** and set a database password. **Save the password.**
2. When the project is ready, click **Connect** (top bar) → **Connection string** → **Transaction pooler**. Copy the URI, which looks like
   `postgresql://postgres.abcd:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`
3. Replace `[YOUR-PASSWORD]` with your password. This full string is your **DATABASE_URL**.

You don't need to create any tables. The app does that on first launch.

## 3. Put the code on GitHub
1. Create a new **private** repository called `risa-sponsor-growth-center`. Don't add a README.
2. Upload this folder's contents, except `node_modules` and `.next`. Either:
   - drag and drop the files on the repo page ("uploading an existing file"), or
   - run `git init && git add . && git commit -m "Sponsor Growth Center" && git branch -M main && git remote add origin <repo-url> && git push -u origin main`

## 4. Vercel
1. Go to vercel.com → **Add New… → Project** → import `risa-sponsor-growth-center`.
2. Leave the framework preset as **Next.js**. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Supabase transaction-pooler string from step 2 |
   | `OPENAI_API_KEY` | your OpenAI key |
   | `OPENAI_MODEL` | `gpt-5-mini` (optional) |

3. Click **Deploy**. When it finishes, open the URL.
4. The first visit shows "The database is empty". Click **Initialize database**. This loads the original Sponsor Dataset and the simulated app layer, which takes about 10 to 20 seconds.

## 5. Check it works
- The Overview should show **24 / 28** confirmed partnerships and **60 / 55** qualified brands.
- Ask the copilot: "How much cash have we actually collected?" It should say the figure is simulated and that the source has no receipts.
- Optional: from your computer, run `BASE_URL=https://<your-app>.vercel.app npm run eval` to produce `eval-report.md`. The eval resets the data at the end.

## Troubleshooting
- **"DATABASE_URL is not set"**: add the variable in Vercel → Settings → Environment Variables, then redeploy.
- **Copilot says it isn't configured**: `OPENAI_API_KEY` is missing. Add it and redeploy.
- **Copilot error about the model**: set `OPENAI_MODEL` to a model your account can use that supports function calling (for example `gpt-4.1-mini`), then redeploy.
- **Initialize times out**: in Supabase, open **SQL Editor** and run `db/schema.sql` and then `db/seed.sql`. Alternatively, run `DATABASE_URL=... npm run db:seed` locally.
