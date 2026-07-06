import { createClient } from "@supabase/supabase-js";

function sendJson(res: any, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default async function handler(_req: any, res: any) {
  try {
    const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
    const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
    const adminEmails = String(process.env.ADMIN_EMAILS || "true.alpha0902@gmail.com").trim();

    if (!supabaseUrl || !serviceRoleKey) {
      sendJson(res, 500, {
        ok: false,
        env: {
          hasSupabaseUrl: Boolean(supabaseUrl),
          hasServiceRoleKey: Boolean(serviceRoleKey),
          adminEmails,
        },
        error: "缺少 Vercel 環境變數。需要 VITE_SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY。",
      });
      return;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw error;

    sendJson(res, 200, {
      ok: true,
      env: {
        hasSupabaseUrl: true,
        hasServiceRoleKey: true,
        adminEmails,
      },
      message: "Admin API OK",
    });
  } catch (error) {
    console.error("/api/admin/ping failed:", error);
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
