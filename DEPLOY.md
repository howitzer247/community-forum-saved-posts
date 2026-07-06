# DEPLOYMENT GUIDE

The app deploys as three free-tier pieces:

- **Database → Turso** (hosted libSQL, same engine as local SQLite)
- **API → Render** (runs the Express server)
- **Frontend → Vercel** (serves the React build)

Do them in this order.

---

## 1. Database on Turso

1. Go to https://turso.tech and sign up (GitHub login).
2. Install the CLI or use the web dashboard. In the dashboard: **Create Database**
   → name it `saved-posts` → pick a region near you.
3. Open the database → copy its **Database URL** (looks like
   `libsql://saved-posts-<you>.turso.io`).
4. Create a **token**: database → **Create Token** → copy it.

Keep both — the URL and the token — for step 2.

## 2. API on Render

1. Go to https://render.com → sign up (GitHub login) → **New → Web Service**.
2. Connect your GitHub and pick the `community-forum-saved-posts` repo.
3. Configure:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
4. Add **Environment Variables**:
   - `TURSO_DATABASE_URL` = the Turso URL from step 1
   - `TURSO_AUTH_TOKEN` = the Turso token from step 1
   - `SEED_ON_BOOT` = `true`  *(seeds the DB on first boot)*
5. **Create Web Service.** Wait for it to deploy, then copy the live URL
   (e.g. `https://community-forum-api.onrender.com`).
6. Test it: open `<render-url>/health` — you should see `{"ok":true}`.
7. **Important:** once it's live and seeded, go back to the env vars and set
   `SEED_ON_BOOT` = `false` (or remove it) so restarts don't re-seed. Then click
   **Manual Deploy → Clear build cache & deploy** once, or just leave it — the seed
   clears and re-inserts the same known data, which is fine for a demo.

## 3. Frontend on Vercel

1. Go to https://vercel.com → sign up (GitHub login) → **Add New → Project**.
2. Import the `community-forum-saved-posts` repo.
3. Configure:
   - **Root Directory:** `web`
   - Framework preset: **Vite** (auto-detected)
4. Add an **Environment Variable**:
   - `VITE_API_URL` = your Render API URL from step 2 (no trailing slash),
     e.g. `https://community-forum-api.onrender.com`
5. **Deploy.** Copy the live URL (e.g. `https://saved-posts.vercel.app`).

That Vercel URL is what goes in the submission form.

## 4. Verify end to end

Open the Vercel URL. Use the user switcher (Alice/Bob/Carol/Morgan), open the Feed,
save/un-save posts, check the Saved tab, flip the locale. If posts load and saving
works, the whole chain (Vercel → Render → Turso) is live.

> Note: Render's free tier sleeps after inactivity, so the **first request after a
> while may take ~30s** to wake the server. Mention this to the reviewer, or hit the
> `/health` URL once to warm it up before they look.
