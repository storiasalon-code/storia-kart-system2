// app/src/lib/liff.ts
import liff from "@line/liff";

/**
 * LIFF初期化（LINE内で開かれた時だけ実行）
 * localhost直開きでは「初期化しない」でOKにする
 */
export async function initLiffSafe(): Promise<{
  ok: boolean;
  inClient: boolean;
  reason?: string;
}> {
  try {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

    // LIFF IDがない場合も落とさずに返す
    if (!liffId) {
      return { ok: false, inClient: false, reason: "LIFF_ID_MISSING" };
    }

    // 初期化（ここで失敗しても catch で拾う）
    await liff.init({ liffId });

    // LINE内（LIFFブラウザ）かどうか
    const inClient = liff.isInClient();

    // LINE外（普通のブラウザ/localhost）ならログインを強制しない
    return { ok: true, inClient };
  } catch (e: any) {
    return { ok: false, inClient: false, reason: e?.message ?? "LIFF_INIT_FAILED" };
  }
}

/**
 * プロフィール取得（取れない場合は null）
 */
export async function getLineUserIdSafe(): Promise<string | null> {
  try {
    // init済み前提
    if (!liff.isLoggedIn()) {
      // LINE外ならログイン誘導しない（落とさない）
      return null;
    }
    const profile = await liff.getProfile();
    return profile?.userId ?? null;
  } catch {
    return null;
  }
}
