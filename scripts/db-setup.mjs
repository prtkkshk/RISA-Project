// Creates tables and loads the original dataset into the database in DATABASE_URL.
// Usage: DATABASE_URL=... npm run db:seed   (the app's "Initialize / Reset" button does the same)
import fs from "node:fs";
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL"); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
await c.connect();
await c.query(fs.readFileSync("db/schema.sql", "utf8"));
await c.query(fs.readFileSync("db/seed.sql", "utf8"));
const r = await c.query("select (select count(*) from brands) brands, (select count(*) from opportunity_history) opp_versions");
console.log("Database ready:", r.rows[0]);
await c.end();
