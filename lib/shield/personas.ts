import { EMPTY_PROFILE, type Profile } from "@/lib/profile";

/**
 * 演示用的两份示例档案：同一份广告，换一个人看，「针对你的提示」不同。
 * 只在首页带 ?as= 参数时出现（路演演示用），不出现在普通用户的界面里。
 * 都是虚构的示例人物，字段只取档案里本来就有的那些。
 */
export interface Persona {
  id: "student" | "retired";
  label: string;
  desc: string;
  profile: Profile;
}

export const PERSONAS: Persona[] = [
  {
    id: "student",
    label: "大学生",
    desc: "在校学生 · 偏进取 · 背着一笔分期",
    profile: {
      ...EMPTY_PROFILE,
      ageBand: "18-25",
      lifeStage: "student",
      riskType: "aggressive",
      riskScore: 78,
      knowledge: { level: "none", points: 0, cleared: [], weakTerms: [] },
      encountered: [],
      debtApr: 0.1303,
      updatedAt: new Date(0).toISOString(),
    },
  },
  {
    id: "retired",
    label: "退休阿姨",
    desc: "已退休 · 偏保守 · 60 岁以上",
    profile: {
      ...EMPTY_PROFILE,
      ageBand: "60+",
      lifeStage: "retired",
      riskType: "conservative",
      riskScore: 18,
      knowledge: { level: "none", points: 0, cleared: [], weakTerms: [] },
      encountered: [],
      updatedAt: new Date(0).toISOString(),
    },
  },
];

export function getPersona(id?: string | null): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
