import liff from "@line/liff";

export async function initLiff() {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) throw new Error("NEXT_PUBLIC_LIFF_ID is missing");

  await liff.init({ liffId });

  // 未ログインならログインに飛ばす（戻ってきたら続行される）
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return; // ここで一旦止める
  }
}

export async function getLineUserId() {
  const profile = await liff.getProfile();
  return profile.userId; // ここが確実
}
