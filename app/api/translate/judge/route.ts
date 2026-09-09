/**
 * 骗局识别测试的判定接口。
 *
 * 关键设计：判定结果**不预存在 data/quiz.json 里**，而是每次由规则引擎实时算出。
 * 这样页面上展示的「财智通怎么判」就一定是引擎的真实输出，改了规则库这里立刻跟着变，
 * 不会出现「题库里写着红、引擎实际判绿」的自欺欺人。
 *
 * 只读调用 lib/rules/match，不做任何模型调用——所以它快、稳定、可离线演示。
 */
import quizData from "@/data/quiz.json";
import { analyzeText } from "@/lib/rules/match";
import { DISCLAIMER } from "@/lib/types";

export const runtime = "nodejs";

interface JudgeItem {
  id: string;
  label: string;
  text: string;
}

const ITEMS = (quizData as { judgeSet: { items: JudgeItem[] } }).judgeSet.items;

export interface JudgeResult {
  id: string;
  label: string;
  /** 规则引擎判定：red / yellow / green */
  level: "red" | "yellow" | "green";
  hardTypes: number;
  highTypes: number;
  /** 命中的特征，已按特征类型去重 */
  hits: Array<{ patternId: string; type: string; severity: "hard" | "high"; matched: string; plain: string }>;
  /** 缺失的关键要素标签 */
  missing: string[];
}

export async function POST(req: Request) {
  let ids: string[] = [];
  try {
    const body = (await req.json()) as { ids?: unknown };
    if (Array.isArray(body.ids)) ids = body.ids.filter((i): i is string => typeof i === "string");
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const picked = ids.length ? ITEMS.filter((it) => ids.includes(it.id)) : ITEMS;
  if (picked.length === 0) return Response.json({ error: "没有可判定的段落" }, { status: 400 });

  const results: JudgeResult[] = picked.map((item) => {
    const a = analyzeText(item.text);
    const seen = new Set<string>();
    const hits = a.hits
      .filter((h) => {
        if (seen.has(h.patternId)) return false;
        seen.add(h.patternId);
        return true;
      })
      .map((h) => ({
        patternId: h.patternId,
        type: h.type,
        severity: h.severity,
        matched: h.matched,
        plain: h.plain,
      }));

    return {
      id: item.id,
      label: item.label,
      level: a.level,
      hardTypes: a.hardTypes,
      highTypes: a.highTypes,
      hits,
      missing: a.elements.filter((e) => !e.present).map((e) => e.label),
    };
  });

  return Response.json({ results, disclaimer: DISCLAIMER });
}
