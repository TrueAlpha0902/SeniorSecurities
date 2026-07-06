import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

type Command = "list" | "revoke" | "restore" | "reset-devices" | "disable-code" | "delete-auth" | "help";

type CliOptions = {
  command: Command;
  email?: string;
  code?: string;
  softDelete: boolean;
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
  const command = (argv[0] ?? "help") as Command;
  const options: CliOptions = { command, softDelete: true };

  for (const arg of argv.slice(1)) {
    if (arg.startsWith("--email=")) options.email = arg.slice("--email=".length).trim();
    if (arg.startsWith("--code=")) options.code = arg.slice("--code=".length).trim();
    if (arg === "--hard") options.softDelete = false;
  }

  if (!["list", "revoke", "restore", "reset-devices", "disable-code", "delete-auth", "help"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  return options;
}

function printHelp(): void {
  console.log(`Admin commands:

List members:
  npx tsx scripts/admin-users.ts list

Kick / revoke a paid user:
  npx tsx scripts/admin-users.ts revoke --email=user@example.com

Restore a paid user:
  npx tsx scripts/admin-users.ts restore --email=user@example.com

Reset a user's registered devices:
  npx tsx scripts/admin-users.ts reset-devices --email=user@example.com

Disable an unused activation code:
  npx tsx scripts/admin-users.ts disable-code --code=SENIOR-2026-XXXX

Delete an Auth account, not recommended unless you really want to remove the login:
  npx tsx scripts/admin-users.ts delete-auth --email=user@example.com

Hard delete an Auth account:
  npx tsx scripts/admin-users.ts delete-auth --email=user@example.com --hard
`);
}

function requireArg(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function findUserIdByEmail(supabase: any, email: string): Promise<string> {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = data.users.find((user: { id: string; email?: string }) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < perPage) break;
    page += 1;
  }

  throw new Error(`找不到這個 Email 的 Auth 使用者：${email}`);
}

async function main(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const options = parseArgs(process.argv.slice(2));
  if (options.command === "help") {
    printHelp();
    return;
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (options.command === "list") {
    const { data, error } = await supabase.rpc("admin_list_members");
    if (error) throw error;
    console.table(data);
    return;
  }

  if (options.command === "revoke") {
    const { data, error } = await supabase.rpc("admin_revoke_user_by_email", {
      p_email: requireArg(options.email, "--email"),
    });
    if (error) throw error;
    console.table(data);
    console.log("Done: user entitlement revoked and active devices kicked.");
    return;
  }

  if (options.command === "restore") {
    const { data, error } = await supabase.rpc("admin_restore_user_by_email", {
      p_email: requireArg(options.email, "--email"),
    });
    if (error) throw error;
    console.table(data);
    console.log("Done: user restored to full permanent access.");
    return;
  }

  if (options.command === "reset-devices") {
    const { data, error } = await supabase.rpc("admin_reset_devices_by_email", {
      p_email: requireArg(options.email, "--email"),
    });
    if (error) throw error;
    console.table(data);
    console.log("Done: active device slots cleared. The user can log in again on new devices.");
    return;
  }

  if (options.command === "disable-code") {
    const { data, error } = await supabase.rpc("admin_disable_activation_code", {
      p_code: requireArg(options.code, "--code"),
    });
    if (error) throw error;
    console.table(data);
    console.log("Done: activation code disabled.");
    return;
  }

  if (options.command === "delete-auth") {
    const email = requireArg(options.email, "--email");
    const userId = await findUserIdByEmail(supabase, email);
    const { error } = await supabase.auth.admin.deleteUser(userId, options.softDelete);
    if (error) throw error;
    console.log(`Done: Auth user deleted for ${email}. softDelete=${options.softDelete}`);
    return;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
