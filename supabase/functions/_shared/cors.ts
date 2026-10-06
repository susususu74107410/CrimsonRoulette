// 모든 Edge Function이 공유하는 CORS/응답 헬퍼.
//
// ⚠️ 배포 전 확인: Access-Control-Allow-Origin 을 '*' 로 두면 누구나 API를 호출할 수
// 있습니다. 이벤트가 시작되면 실제 프론트엔드 주소(예: https://your-game.netlify.app)
// 로 바꾸는 것을 권장합니다.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorJson(message: string, status = 400): Response {
  return json({ error: message }, status);
}
