#!/usr/bin/env node
import crypto from "node:crypto";
import process from "node:process";

const pin = String(process.argv[2] || "").replace(/\D/g, "");
if (!pin) {
  console.error("Usage: node scripts/hash-pin.mjs 19642002");
  process.exit(1);
}
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.pbkdf2Sync(pin, `vinology:${salt}`, 120000, 32, "sha256").toString("hex");
console.log(`ADMIN_PIN_DIGITS=${pin.length}`);
console.log(`ADMIN_PIN_SALT=${salt}`);
console.log(`ADMIN_PIN_HASH=${hash}`);
