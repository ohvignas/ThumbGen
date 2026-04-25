import path from "path";
import fs from "fs";
import os from "os";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thumbgen-test-"));
process.env.THUMBGEN_DB_PATH = path.join(dir, "thumbgen.db");
