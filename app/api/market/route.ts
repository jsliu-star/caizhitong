import { fetchMarket } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await fetchMarket(60));
  } catch {
    return Response.json({ error: "行情数据暂时不可用" }, { status: 503 });
  }
}
