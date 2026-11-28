import type { SelectionType, StepType } from "@/types/database";

const FULL_WIDTH = "ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９（）";
const HALF_WIDTH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789()";

/**
 * 企業名の簡易正規化 (企業別一覧の集計用。完全な名寄せは行わない)
 *   全角英数→半角, 小文字化, 法人格表記の除去, 空白・記号の除去
 */
export function normalizeCompanyName(name: string) {
  const halfWidth = Array.from(name.trim(), (c) => {
    const i = FULL_WIDTH.indexOf(c);
    return i >= 0 ? HALF_WIDTH[i] : c;
  }).join("");
  return halfWidth
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|\(株\)|\(有\)|㈱|co\.,?\s*ltd\.?|inc\.?|corp\.?/g, "")
    .replace(/[\s　・,.]/g, "");
}

/** 応募作成時にコピーされる初期ステップ (変更しても既存の応募には影響しない) */
export const STEP_TEMPLATES: Record<SelectionType, { step_type: StepType; display_name: string }[]> = {
  FULL_TIME: [
    { step_type: "DOCUMENT", display_name: "ES" },
    { step_type: "APTITUDE_TEST", display_name: "適性検査" },
    { step_type: "FIRST_INTERVIEW", display_name: "一次面接" },
    { step_type: "SECOND_INTERVIEW", display_name: "二次面接" },
    { step_type: "FINAL_INTERVIEW", display_name: "最終面接" },
  ],
  INTERNSHIP: [
    { step_type: "DOCUMENT", display_name: "ES" },
    { step_type: "APTITUDE_TEST", display_name: "適性検査" },
    { step_type: "FIRST_INTERVIEW", display_name: "面接" },
  ],
};
