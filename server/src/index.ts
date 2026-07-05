import { createApp } from './app.js';
import { createDb, migrate } from './db/index.js';

const db = createDb('file:forum.db');
await migrate(db); // idempotent — safe on every boot
const app = createApp(db);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
