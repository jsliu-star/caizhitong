import { fetchStock } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const r = await fetchStock(code);
  if ("error" in r) return Response.json(r, { status: 400 });
  return Response.json(r);
}
