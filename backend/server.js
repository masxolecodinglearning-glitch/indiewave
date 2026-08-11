const env = require("./config/env");
const app = require("./app");
const db = require("./config/db");

async function start() {
  try {
    await db.query("SELECT 1");
    app.listen(env.port, () => {
      console.log(`IndieWave API running on port ${env.port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

start();