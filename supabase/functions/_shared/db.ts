import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// 서비스 롤 키를 쓰는 클라이언트. RLS를 우회하므로 반드시 Edge Function
// (서버 쪽) 안에서만 생성해야 하고, 프론트엔드로 절대 내보내면 안 됩니다.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 Supabase가 Edge Function에
// 자동으로 주입하는 환경변수라 별도 설정이 필요 없습니다.
export function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}
