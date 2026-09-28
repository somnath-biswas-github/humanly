import "dotenv/config";
import { migrate, closeDb } from "./db.js";

try {
  await migrate();
  console.log("Database migrations applied.");
} finally {
  await closeDb();
}