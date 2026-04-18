import { sql } from "bun";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

async function migrate() {
  // Create the tracking table if it doesn't exist yet
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Read all .sql files from the migrations folder, sorted by name
  const migrationsDir = join(import.meta.dir, "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const filename of files) {
    // Check if this migration has already been applied
    const rows = await sql`
      SELECT filename FROM schema_migrations WHERE filename = ${filename}
    `;

    if (rows.length > 0) {
      console.log(`  skip  ${filename}`);
      continue;
    }

    // Read and run the SQL file
    // sql.unsafe is used here because this is trusted internal content
    // (our own migration files), never user input
    const filePath = join(migrationsDir, filename);
    const migrationSQL = readFileSync(filePath, "utf8");
    await sql.unsafe(migrationSQL);

    // Record that it was applied
    await sql`
      INSERT INTO schema_migrations (filename) VALUES (${filename})
    `;

    console.log(`  apply ${filename}`);
  }

  console.log("Migrations complete.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});