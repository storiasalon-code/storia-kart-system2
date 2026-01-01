// src/lib/liff.ts
import liff from "@line/liff";

// index.tsx から呼ばれる名前に合わせる
export async function initLiff(): Promise<boolean> {
  try {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) return false;

    await liff.init({ liffId });
    return liff.isInClient();
  } catch {
    return false;
  }
}

export async function getLineUserId(): Promise<string | null> {
  try {
    if (!liff.isLoggedIn()) return null;
    const profile = await liff.getProfile();
    return profile.userId ?? null;
  } catch {
    return null;
  }
}
