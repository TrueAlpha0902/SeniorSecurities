import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

type CliOptions = {
  code?: string;
  note?: string;
  uses: number;
};

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { uses: 1 };
  for (const arg of argv) {
    if (arg.startsWith("--code=")) options.code = arg.slice("--code=".length);
    if (arg.startsWith("--note=")) options.note = arg.slice("--note=".length);
    if (arg.startsWith("--uses=")) options.uses = Number(arg.slice("--uses=".length));
  }
  if (!Number.isInteger(options.uses) || options.uses < 1) {
    throw new Error("--uses must be a positive integer.");
  }
  return options;
}

async function main(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const options = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Put both in .env.local. Never prefix the service role key with VITE_.",
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("create_activation_code", {
    p_code: options.code ?? null,
    p_note: options.note ?? null,
    p_max_uses: options.uses,
  });

  if (error) throw error;

  console.log("Activation code created:");
  console.log(data);
  console.log("Give this code to the buyer after payment. The database now recognizes it.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
