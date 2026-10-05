import { checkRate, jsonError } from "@/lib/server/limits";
import { fetchMarket } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rate = checkRate(req, "market");
  if (!rate.ok) return jsonError(rate.status, rate.message, { code: rate.code, retryAfter: rate.retryAfter });
  try {
    return Response.json(await fetchMarket(60));
  } catch {
    return Response.json({ error: "行情数据暂时不可用" }, { status: 503 });
  }
}
