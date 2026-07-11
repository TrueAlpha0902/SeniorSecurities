import { type ApiRequest, type ApiResponse, requireAdminUser, sendError, sendJson } from "../_adminClient.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { supabase } = await requireAdminUser(req);
    const { data, error } = await supabase
      .from("admin_audit_events")
      .select("id, actor_user_id, actor_email, target_user_id, target_email, action, metadata, ip_address, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    sendJson(res, 200, {
      events: (data || []).map((row) => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        actorEmail: row.actor_email,
        targetUserId: row.target_user_id,
        targetEmail: row.target_email,
        action: row.action,
        metadata: row.metadata || {},
        ipAddress: row.ip_address,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error("/api/admin/audit-events failed:", error);
    sendError(res, error);
  }
}
