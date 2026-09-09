import glossaryData from "@/data/glossary.json";
import { normalize } from "@/lib/rules/match";

export interface Term {
  term: string;
  aliases: string[];
  plain: string;
  watch: string;
  /** 分类：活钱 / 固收 / 权益 / 费用 / 风险 / 工具 */
  group: string;
}

export interface KeyPoint {
  id: string;
  text: string;
  evidence: string;
}

export const TERMS = glossaryData.terms as Term[];
const KEY_POINTS = glossaryData.keyPoints as Array<{ id: string; match: string[]; text: string }>;

/** 找出文本里出现的术语（确定性，不依赖模型） */
export function findTerms(rawText: string): Array<Term & { hitBy: string }> {
  const text = normalize(rawText);
  const out: Array<Term & { hitBy: string }> = [];
  for (const t of TERMS) {
    const hitBy = [t.term, ...t.aliases].find((k) => text.includes(k));
    if (hitBy) out.push({ ...t, hitBy });
  }
  return out;
}

/** 找出这段话里最该注意的点（确定性） */
export function findKeyPoints(rawText: string): KeyPoint[] {
  const text = normalize(rawText);
  const out: KeyPoint[] = [];
  for (const kp of KEY_POINTS) {
    const evidence = kp.match.find((m) => text.includes(m));
    if (evidence) out.push({ id: kp.id, text: kp.text, evidence });
  }
  return out;
}
