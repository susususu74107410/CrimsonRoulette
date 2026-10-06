import { getServiceClient } from "./db.ts";

type AuthOk = { runnerId: string };
type AuthErr = { error: string; status: number };

export async function requireRunner(req: Request): Promise<AuthOk | AuthErr> {
  const header = req.headers.get("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "로그인이 필요합니다.", status: 401 };

  const db = getServiceClient();
  const { data, error } = await db
    .from("sessions")
    .select("runner_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    return { error: "세션이 유효하지 않습니다. 다시 로그인해주세요.", status: 401 };
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { error: "세션이 만료되었습니다. 다시 로그인해주세요.", status: 401 };
  }
  return { runnerId: data.runner_id };
}

export function isAuthError(x: AuthOk | AuthErr): x is AuthErr {
  return (x as AuthErr).error !== undefined;
}

type AdminOk = { ok: true };

export async function requireAdmin(req: Request): Promise<AdminOk | AuthErr> {
  const header = req.headers.get("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "관리자 인증이 필요합니다.", status: 401 };

  const db = getServiceClient();
  const { data, error } = await db
    .from("admin_sessions")
    .select("expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    return { error: "관리자 세션이 유효하지 않습니다.", status: 401 };
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { error: "관리자 세션이 만료되었습니다.", status: 401 };
  }
  return { ok: true };
}
