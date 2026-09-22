#!/usr/bin/env node

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ENCRYPTION_KEY",
  "META_APP_SECRET",
];

const recommended = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_LOCALE",
  "AUTOMATION_CRON_SECRET",
];

const failures = [];
const warnings = [];

for (const key of required) {
  if (!process.env[key]?.trim()) failures.push(`${key}: missing`);
}

const encryptionKey = process.env.ENCRYPTION_KEY?.trim();
if (encryptionKey && !/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
  failures.push("ENCRYPTION_KEY: must be exactly 64 hexadecimal characters");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
if (supabaseUrl) {
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:") failures.push("NEXT_PUBLIC_SUPABASE_URL: must use HTTPS");
  } catch {
    failures.push("NEXT_PUBLIC_SUPABASE_URL: invalid URL");
  }
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
if (siteUrl) {
  try {
    const url = new URL(siteUrl);
    if (url.protocol !== "https:") warnings.push("NEXT_PUBLIC_SITE_URL: production should use HTTPS");
    if (url.pathname !== "/" || url.search || url.hash) {
      warnings.push("NEXT_PUBLIC_SITE_URL: use only scheme + host, without path/query/hash");
    }
  } catch {
    failures.push("NEXT_PUBLIC_SITE_URL: invalid URL");
  }
}

const locale = process.env.NEXT_PUBLIC_APP_LOCALE?.trim();
if (locale && !["en", "ko", "pt", "es"].includes(locale)) {
  failures.push("NEXT_PUBLIC_APP_LOCALE: must be one of en, ko, pt, es");
}

if (process.env.WHATSAPP_TEMPLATES_DRY_RUN === "true" && process.env.NODE_ENV === "production") {
  failures.push("WHATSAPP_TEMPLATES_DRY_RUN: must not be true in production");
}

for (const key of recommended) {
  if (!process.env[key]?.trim()) warnings.push(`${key}: not set`);
}

if (warnings.length) {
  console.log("Warnings:");
  for (const item of warnings) console.log(`  - ${item}`);
}

if (failures.length) {
  console.error("Preflight failed:");
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}

console.log("Environment preflight passed. Secret values were not printed.");
