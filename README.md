# Creative Team (CT) — prototype

A private Trello-style task board for your committee. Free to run.

**Stack:** React (Vite) + Supabase (login, database, live updates, emails) + Vercel/Netlify (hosting).

**Features:** boards · categories (columns) you can add/rename/delete · drag & drop tasks ·
create/edit/delete tasks · assign, due date · comments (add/edit/delete) · add/remove members by email ·
notifications (new task, task moved to another category, new comment) · login, sign up,
forgot password, reset password · data locked per-board with database security rules.

---

## Step 1 — Run it on your computer

1. Install **Node.js** (LTS) from https://nodejs.org
2. Open a terminal in this `creative-team` folder and run:
   ```
   npm install
   ```

## Step 2 — Create the free Supabase backend

1. Go to https://supabase.com → sign up → **New project** (pick any name, set a database password, choose the region closest to you).
2. When it's ready, open **SQL Editor → New query**, paste the entire contents of `supabase/schema.sql`, and click **Run**. You should see "Success".
3. Open **Project Settings → API**. Copy:
   - **Project URL**
   - **anon public** key
4. In this folder, copy `.env.example` to a new file named `.env` and paste the two values in.

## Step 3 — Configure login emails (Authentication → settings)

1. **Authentication → URL Configuration**
   - *Site URL*: `http://localhost:5173` for now (change to your real website address after publishing).
   - *Redirect URLs*: add `http://localhost:5173/**` (and later `https://YOUR-SITE/**`).
2. **Authentication → Providers → Email**: keep "Confirm email" on (recommended). Set a minimum password length of 8 or more.
3. **Important:** Supabase's built-in email sender is limited to a few emails per hour — fine for testing, but too low for a real team.
   Before inviting everyone, set up free custom SMTP in **Project Settings → Authentication → SMTP Settings**
   (Brevo, Resend, or Gmail app password all have free tiers).

## Step 4 — Try it

```
npm run dev
```
Open http://localhost:5173, sign up, create a board, add tasks, drag them around.
Sign up a second account (use another email/browser) and add it from **Members** to test notifications.

## Step 5 — Publish (free)

**Vercel** (easiest):
1. Put this folder on GitHub (private repo is fine; `.env` is already git-ignored).
2. https://vercel.com → **Add New → Project** → import the repo.
3. Under **Environment Variables** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. You get a URL like `https://creative-team.vercel.app`.
5. Go back to Supabase **Authentication → URL Configuration** and set *Site URL* to that URL, and add `https://YOUR-URL/**` to Redirect URLs. **Password reset links will not work until you do this.**

(Netlify works too: build command `npm run build`, publish directory `dist`. The `public/_redirects` file is already included.)

## How members work

- **Members → Add:** type a teammate's email. If they already have an account they are added instantly.
  If not, they're saved as a pending invite and are added to the board automatically the first time they sign up with that email.
  (The app does not send an invite email itself — tell them to sign up, or use "Forgot password" once they exist.)
- Only the **board owner** can add members or delete the board. Any member can leave.

## Security notes

- Passwords are handled by Supabase Auth (hashed, never stored by this app).
- Every table has Row Level Security: people can only see boards they belong to, and notifications are private to each person.
- Only the `anon` key goes in the website. **Never** put the `service_role` key in this project.
- Anyone can create an account, but a new account sees nothing until a board owner adds their email.

## Ideas for later

Labels/colors, file attachments, activity log, email notifications, reordering categories, due-date reminders.
