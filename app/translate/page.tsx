import { redirect } from "next/navigation";

/** 条款翻译已并入首页；知识学习移至 /learn */
export default function TranslateRedirect() {
  redirect("/learn");
}
