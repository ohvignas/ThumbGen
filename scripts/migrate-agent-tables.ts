import { getDb } from "../src/lib/db";
import { AGENT_TABLES_DDL } from "../src/lib/agent/migrations";

const db = getDb();
db.exec(AGENT_TABLES_DDL);
console.log(`Migration done (${process.env.THUMBGEN_DB_PATH || "data/thumbgen.db"}).`);
