import { createApp } from './app.js';
import { createDb, migrate } from './db/index.js';
import { seed } from './db/seed.js';

const db = createDb();
await migrate(db); // idempotent — safe on every boot

// On first boot with an empty DB, seed it. Controlled by SEED_ON_BOOT so we don't
// re-seed (and wipe) on every restart in production once data exists.
if (process.env.SEED_ON_BOOT === 'true') {
  await seed(db);
}

const app = createApp(db);
const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
