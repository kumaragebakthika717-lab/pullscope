import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL in .env.local (Supabase → Project Settings → Database → Connection string).");
  process.exit(1);
}

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const file of files) {
    console.log(`Applying ${file}…`);
    await client.query(readFileSync(path.join(dir, file), "utf8"));
  }
  console.log("Done.");
} finally {
  await client.end();
}
