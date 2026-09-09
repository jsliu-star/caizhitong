/** 输入脱敏：在任何内容进入模型或落盘之前，先抹掉个人敏感信息 */

const RULES: Array<{ re: RegExp; to: string }> = [
  // 身份证（18 位）
  { re: /\b\d{6}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g, to: "【身份证号已隐去】" },
  // 银行卡（16–19 位连续数字）
  { re: /\b\d{16,19}\b/g, to: "【卡号已隐去】" },
  // 手机号
  { re: /\b1[3-9]\d{9}\b/g, to: "【手机号已隐去】" },
  // 邮箱
  { re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, to: "【邮箱已隐去】" },
];

export function redact(input: string): { text: string; count: number } {
  let count = 0;
  let text = input;
  for (const { re, to } of RULES) {
    text = text.replace(re, () => {
      count += 1;
      return to;
    });
  }
  return { text, count };
}
