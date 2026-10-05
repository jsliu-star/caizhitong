import { checkRate, jsonError } from "@/lib/server/limits";
import { fetchStock } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rate = checkRate(req, "stock");
  if (!rate.ok) return jsonError(rate.status, rate.message, { code: rate.code, retryAfter: rate.retryAfter });
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const r = await fetchStock(code);
  if ("error" in r) return Response.json(r, { status: 400 });
  return Response.json(r);
}
