import { redirect } from "next/navigation";

/** 安全盾已并入首页的「识别与翻译」 */
export default function ShieldRedirect() {
  redirect("/");
}
