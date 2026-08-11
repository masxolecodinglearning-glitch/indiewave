const fs = require("fs");
const path = require("path");
const db = require("../config/db");

async function migrate() {
  const schemaPath = path.resolve(__dirname, "../../database/schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");
  await db.query(sql);
  console.log("Migration completed successfully.");
  process.exit(0);
}

migrate().catch((error) => {
  console.error("Migration failed", error);
  process.exit(1);
});