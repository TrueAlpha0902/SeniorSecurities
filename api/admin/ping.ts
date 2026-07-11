import { requireAdminUser, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_adminClient.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { supabase } = await requireAdminUser(req);
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw error;

    sendJson(res, 200, {
      ok: true,
      message: "Admin API OK",
    });
  } catch (error) {
    console.error("/api/admin/ping failed:", error);
    sendError(res, error);
  }
}
