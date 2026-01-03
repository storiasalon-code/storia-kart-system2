import styles from "../styles/premium.module.css";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  User,
} from "firebase/auth";

import { auth, db, storage } from "../src/lib/firebase";

/** -------- helpers -------- */
function fmtDate(ms?: number) {
  if (!ms) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}
function toDatetimeLocal(ms?: number) {
  const d = ms ? new Date(ms) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}
function isEmpty(s: string) {
  return !s || !s.trim();
}

type Customer = {
  id: string;
  displayName?: string;
  lastVisitAt?: number;
  createdAt?: number;
};

type SideBackType = "" | "刈り上げ" | "ツーブロック" | "なし";

type Visit = {
  id: string;
  visitAt: number;
  note?: string;

  photos?: Record<string, string>;
  staffOnly?: { staffPhotoPath?: string | null };

  staffName?: string;
  lineConsent?: "あり" | "なし" | "";
  menu?: string;
  style?: string;

  // 新：サイド/バック（選択+mm）
  sideType?: SideBackType;
  sideMm?: string;
  backType?: SideBackType;
  backMm?: string;

  // 旧互換（過去データ用）
  lengthSide?: string;
  lengthBack?: string;

  styling?: string;
  other?: string;

  createdAt?: number;
  createdBy?: string;
};

type ViewMode = "list" | "customer";

/** -------- main -------- */
export default function AdminPage() {
  // auth
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // login/register form
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  // navigation
  const [mode, setMode] = useState<ViewMode>("list");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // customers
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [qText, setQText] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");

  // visits
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const selectedVisit = useMemo(
    () => visits.find((v) => v.id === selectedVisitId) || null,
    [visits, selectedVisitId]
  );

  // edit form state
  const [visitAtLocal, setVisitAtLocal] = useState(toDatetimeLocal());
  const [note, setNote] = useState("");

  const [staffName, setStaffName] = useState("");
  const [lineConsent, setLineConsent] = useState<"あり" | "なし" | "">("");
  const [menu, setMenu] = useState("");
  const [style, setStyle] = useState("");

  // ★変更：サイド/バックを選択 + mm
  const [sideType, setSideType] = useState<SideBackType>("");
  const [sideMm, setSideMm] = useState("");
  const [backType, setBackType] = useState<SideBackType>("");
  const [backMm, setBackMm] = useState("");

  const [styling, setStyling] = useState("");
  const [other, setOther] = useState("");

  // photos (max 4)
  const [photoFiles, setPhotoFiles] = useState<(File | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const [photoPreview, setPhotoPreview] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  // modal
  const [imgModalUrl, setImgModalUrl] = useState<string | null>(null);

  // keep objectURL cleanup
  const objectUrlsRef = useRef<string[]>([]);

  /** --- auth init --- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (!u) {
        setIsAdmin(false);
        return;
      }
      const a = await getDoc(doc(db, "admins", u.uid));
      setIsAdmin(a.exists());
    });
    return () => unsub();
  }, []);

  /** --- customers realtime --- */
  useEffect(() => {
    if (!user || !isAdmin) {
      setCustomers([]);
      return;
    }
    const q = query(
      collection(db, "customers"),
      orderBy("lastVisitAt", "desc"),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: Customer[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          displayName: data.displayName || "",
          lastVisitAt: data.lastVisitAt || 0,
          createdAt: data.createdAt || 0,
        };
      });
      setCustomers(list);
    });
    return () => unsub();
  }, [user, isAdmin]);

  /** --- visits realtime (selected customer) --- */
  useEffect(() => {
    if (!user || !isAdmin || !selectedCustomer) {
      setVisits([]);
      return;
    }
    const q = query(
      collection(db, "customers", selectedCustomer.id, "visits"),
      orderBy("visitAt", "desc"),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: Visit[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          visitAt: data.visitAt || 0,
          note: data.note || "",
          photos: data.photos || {},
          staffOnly: data.staffOnly || {},
          staffName: data.staffName || "",
          lineConsent: data.lineConsent || "",
          menu: data.menu || "",
          style: data.style || "",

          sideType: data.sideType || "",
          sideMm: data.sideMm || "",
          backType: data.backType || "",
          backMm: data.backMm || "",

          // 旧互換
          lengthSide: data.lengthSide || "",
          lengthBack: data.lengthBack || "",

          styling: data.styling || "",
          other: data.other || "",
          createdAt: data.createdAt || 0,
          createdBy: data.createdBy || "",
        };
      });
      setVisits(list);
      if (selectedVisitId && !list.find((v) => v.id === selectedVisitId)) {
        setSelectedVisitId(null);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, selectedCustomer?.id]);

  /** --- cleanup object urls --- */
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
  }, []);

  /** --- auth actions --- */
  async function login() {
    await signInWithEmailAndPassword(auth, email, pass);
  }

  // ★追加：ログイン画面で新規登録（管理者化まで）
  async function registerAdmin() {
    if (isEmpty(email) || isEmpty(pass)) return alert("Email / Password を入力してください");
    const cred = await createUserWithEmailAndPassword(auth, email, pass);

    // /admins/{uid} を自動作成（＝管理者）
    // ※ここが権限エラーになる場合、Firestore ルール側の許可が必要です。
    await setDoc(
      doc(db, "admins", cred.user.uid),
      { createdAt: Date.now(), createdBy: cred.user.uid },
      { merge: true }
    );

    alert("新規登録しました（管理者として登録済み）");
  }

  async function logout() {
    await signOut(auth);
    setMode("list");
    setSelectedCustomer(null);
    setSelectedVisitId(null);
  }

  /** --- customer actions --- */
  async function createCustomer() {
    if (!isAdmin) return alert("管理者ではありません");
    if (isEmpty(newCustomerName)) return alert("顧客名を入力してください");

    const name = newCustomerName.trim();
    const ref = await addDoc(collection(db, "customers"), {
      displayName: name,
      createdAt: Date.now(),
      lastVisitAt: 0,
    });

    setNewCustomerName("");
    setSelectedCustomer({ id: ref.id, displayName: name, lastVisitAt: 0 });
    setMode("customer");
  }

  async function saveCustomerName(customerId: string, name: string) {
    if (!isAdmin) return alert("管理者ではありません");
    await setDoc(
      doc(db, "customers", customerId),
      { displayName: name.trim() },
      { merge: true }
    );
  }

  async function deleteCustomerAll(customerId: string) {
    if (!isAdmin) return alert("管理者ではありません");
    const ok = confirm(
      "この顧客を削除します。\n来店履歴と写真も削除を試みます。\n本当に削除しますか？"
    );
    if (!ok) return;

    const vSnap = await getDocs(collection(db, "customers", customerId, "visits"));
    for (const d of vSnap.docs) {
      const v = d.data() as any;
      const photos: Record<string, string> = v.photos || {};
      const staffPath: string | null = v.staffOnly?.staffPhotoPath ?? null;

      const paths = [
        photos.after1Path,
        photos.after2Path,
        photos.after3Path,
        photos.after4Path,
        staffPath,
      ].filter(Boolean) as string[];

      for (const p of paths) {
        try {
          await deleteObject(storageRef(storage, p));
        } catch (e) {
          console.warn("deleteObject failed:", p, e);
        }
      }
      await deleteDoc(doc(db, "customers", customerId, "visits", d.id));
    }

    await deleteDoc(doc(db, "customers", customerId));

    if (selectedCustomer?.id === customerId) {
      setSelectedCustomer(null);
      setMode("list");
      setSelectedVisitId(null);
    }
    alert("顧客を削除しました");
  }

  /** --- visit select / reset form --- */
  function resetFormForNewVisit() {
    setSelectedVisitId(null);
    setVisitAtLocal(toDatetimeLocal());
    setNote("");

    setStaffName("");
    setLineConsent("");
    setMenu("");
    setStyle("");

    setSideType("");
    setSideMm("");
    setBackType("");
    setBackMm("");

    setStyling("");
    setOther("");

    objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrlsRef.current = [];
    setPhotoFiles([null, null, null, null]);
    setPhotoPreview([null, null, null, null]);
  }

  async function loadVisitIntoForm(v: Visit) {
    setSelectedVisitId(v.id);
    setVisitAtLocal(toDatetimeLocal(v.visitAt));
    setNote(v.note || "");
    setStaffName(v.staffName || "");
    setLineConsent((v.lineConsent as any) || "");
    setMenu(v.menu || "");
    setStyle(v.style || "");

    // 新データ優先、なければ旧データの文字列を入れる
    setSideType((v.sideType as any) || "");
    setSideMm(v.sideMm || (v.lengthSide || ""));
    setBackType((v.backType as any) || "");
    setBackMm(v.backMm || (v.lengthBack || ""));

    setStyling(v.styling || "");
    setOther(v.other || "");

    const nextPrev: (string | null)[] = [null, null, null, null];

    objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrlsRef.current = [];
    setPhotoFiles([null, null, null, null]);

    const p = v.photos || {};
    const keys = ["after1Path", "after2Path", "after3Path", "after4Path"] as const;

    for (let i = 0; i < 4; i++) {
      const path = (p as any)[keys[i]];
      if (!path) continue;
      try {
        const url = await getDownloadURL(storageRef(storage, path));
        nextPrev[i] = url;
      } catch (e) {
        console.warn("getDownloadURL failed:", path, e);
      }
    }
    setPhotoPreview(nextPrev);
  }

  /** --- photos --- */
  function onPickPhoto(i: number, f: File | null) {
    setPhotoFiles((prev) => {
      const next = [...prev];
      next[i] = f;
      return next;
    });
    if (!f) return;

    const url = URL.createObjectURL(f);
    objectUrlsRef.current.push(url);

    setPhotoPreview((prev) => {
      const next = [...prev];
      next[i] = url;
      return next;
    });
  }

  async function deletePhotoSlot(slot: number) {
    if (!selectedCustomer) return;
    if (!selectedVisit) {
      // 保存前のプレビューだけ消す
      setPhotoFiles((prev) => {
        const next = [...prev];
        next[slot - 1] = null;
        return next;
      });
      setPhotoPreview((prev) => {
        const next = [...prev];
        next[slot - 1] = null;
        return next;
      });
      return;
    }

    const key = `after${slot}Path`;
    const path = (selectedVisit.photos || {})[key];
    if (!path) {
      setPhotoFiles((prev) => {
        const next = [...prev];
        next[slot - 1] = null;
        return next;
      });
      setPhotoPreview((prev) => {
        const next = [...prev];
        next[slot - 1] = null;
        return next;
      });
      return;
    }

    const ok = confirm(`写真${slot}を削除しますか？`);
    if (!ok) return;

    try {
      await deleteObject(storageRef(storage, path));
    } catch (e) {
      console.warn("deleteObject failed:", e);
    }

    const newPhotos = { ...(selectedVisit.photos || {}) };
    delete (newPhotos as any)[key];

    await updateDoc(doc(db, "customers", selectedCustomer.id, "visits", selectedVisit.id), {
      photos: newPhotos,
    });

    setPhotoPreview((prev) => {
      const next = [...prev];
      next[slot - 1] = null;
      return next;
    });
  }

  /** --- visit save --- */
  async function saveVisit() {
    if (!isAdmin) return alert("管理者ではありません");
    if (!selectedCustomer) return alert("顧客を選択してください");

    const visitAtMs = new Date(visitAtLocal).getTime();
    if (!visitAtMs || Number.isNaN(visitAtMs)) return alert("来店日時が不正です");

    const baseData = {
      visitAt: visitAtMs,
      note: note || "",
      staffName: staffName || "",
      lineConsent: lineConsent || "",
      menu: menu || "",
      style: style || "",

      sideType: sideType || "",
      sideMm: sideMm || "",
      backType: backType || "",
      backMm: backMm || "",

      styling: styling || "",
      other: other || "",

      updatedAt: Date.now(),
      updatedBy: auth.currentUser?.uid || "",
    };

    let visitId = selectedVisitId;

    if (!visitId) {
      const vRef = await addDoc(
        collection(db, "customers", selectedCustomer.id, "visits"),
        {
          ...baseData,
          photos: {},
          createdAt: Date.now(),
          createdBy: auth.currentUser?.uid || "",
        }
      );
      visitId = vRef.id;
      setSelectedVisitId(visitId);
    } else {
      await updateDoc(doc(db, "customers", selectedCustomer.id, "visits", visitId), baseData);
    }

    const uploadedPaths: Record<string, string> = {};
    for (let i = 0; i < 4; i++) {
      const f = photoFiles[i];
      if (!f) continue;
      const path = `customers/${selectedCustomer.id}/visits/${visitId}/after_${i + 1}.jpg`;
      await uploadBytes(storageRef(storage, path), f, {
        contentType: f.type || "image/jpeg",
      });
      uploadedPaths[`after${i + 1}Path`] = path;
    }

    if (Object.keys(uploadedPaths).length > 0) {
      const current = selectedVisit?.photos || {};
      await updateDoc(doc(db, "customers", selectedCustomer.id, "visits", visitId), {
        photos: { ...current, ...uploadedPaths },
      });
    }

    await setDoc(
      doc(db, "customers", selectedCustomer.id),
      { lastVisitAt: visitAtMs },
      { merge: true }
    );

    alert("保存しました");
    setPhotoFiles([null, null, null, null]);
  }

  async function deleteVisit(v: Visit) {
    if (!selectedCustomer) return;
    if (!isAdmin) return alert("管理者ではありません");

    const ok = confirm("この履歴を削除しますか？（写真も削除を試みます）");
    if (!ok) return;

    const photos: Record<string, string> = v.photos || {};
    const paths = [
      photos.after1Path,
      photos.after2Path,
      photos.after3Path,
      photos.after4Path,
      v.staffOnly?.staffPhotoPath ?? null,
    ].filter(Boolean) as string[];

    for (const p of paths) {
      try {
        await deleteObject(storageRef(storage, p));
      } catch (e) {
        console.warn("deleteObject failed:", p, e);
      }
    }

    await deleteDoc(doc(db, "customers", selectedCustomer.id, "visits", v.id));

    if (selectedVisitId === v.id) {
      resetFormForNewVisit();
    }
    alert("履歴を削除しました");
  }

  /** -------- UI -------- */
  const filteredCustomers = useMemo(() => {
    const t = qText.trim().toLowerCase();
    if (!t) return customers;
    return customers.filter((c) => (c.displayName || "").toLowerCase().includes(t));
  }, [customers, qText]);

  const ui = useMemo(() => {
    const page: React.CSSProperties = {
      fontFamily: "system-ui, -apple-system",
      background: "#f7f7f8",
      minHeight: "100vh",
      padding: 18,
      color: "#111",
    };

    const container: React.CSSProperties = { maxWidth: 1200, margin: "0 auto" };

    const card: React.CSSProperties = {
      background: "#fff",
      border: "1px solid #e7e7e7",
      borderRadius: 16,
      padding: 16,
      boxShadow: "0 6px 20px rgba(0,0,0,0.04)",
      overflow: "hidden",
      minWidth: 0,
    };

    const btnBase: React.CSSProperties = {
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid #e3e3e3",
      background: "#fff",
      cursor: "pointer",
      fontWeight: 700,
      whiteSpace: "nowrap",
    };

    const btnPrimary: React.CSSProperties = {
      ...btnBase,
      background: "#111",
      color: "#fff",
      borderColor: "#111",
    };

    const btnDanger: React.CSSProperties = {
      ...btnBase,
      background: "#fff",
      color: "#b00020",
      borderColor: "#f2c6cf",
    };

    const input: React.CSSProperties = {
      width: "100%",
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid #e3e3e3",
      outline: "none",
      fontSize: 14,
      background: "#fff",
      minWidth: 0,
      boxSizing: "border-box",
    };

    const label: React.CSSProperties = {
      fontSize: 12,
      opacity: 0.75,
      marginBottom: 6,
      fontWeight: 700,
    };

    const textarea: React.CSSProperties = {
      ...input,
      minHeight: 160,
      resize: "vertical",
      lineHeight: 1.6,
    };

    const grid2: React.CSSProperties = {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      alignItems: "start",
      minWidth: 0,
    };

    const row: React.CSSProperties = {
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      alignItems: "center",
      minWidth: 0,
    };

    const divider: React.CSSProperties = { height: 1, background: "#ededed", margin: "6px 0" };

    return { page, container, card, btnBase, btnPrimary, btnDanger, input, textarea, label, grid2, row, divider };
  }, []);

  /** --- Auth Loading --- */
  if (authLoading) {
    return <div style={{ padding: 24, fontFamily: "system-ui, -apple-system" }}>読み込み中…</div>;
  }

  /** --- Not logged in --- */
  if (!user) {
    return (
      <div style={ui.page}>
        <div style={{ ...ui.container, maxWidth: 520 }}>
          <h1 style={{ margin: "8px 0 14px" }}>STORIA 電子カルテ（管理）</h1>

          <div style={ui.card}>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <button
                style={isRegister ? ui.btnBase : ui.btnPrimary}
                onClick={() => setIsRegister(false)}
              >
                ログイン
              </button>
              <button
                style={isRegister ? ui.btnPrimary : ui.btnBase}
                onClick={() => setIsRegister(true)}
              >
                新規登録
              </button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <input style={ui.input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input style={ui.input} placeholder="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />

              {!isRegister ? (
                <>
                  <button style={ui.btnPrimary} onClick={login}>
                    ログイン
                  </button>
                  <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.6 }}>
                    既存アカウントでログインします。
                  </div>
                </>
              ) : (
                <>
                  <button style={ui.btnPrimary} onClick={registerAdmin}>
                    新規登録（管理者として登録）
                  </button>
                  <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.6 }}>
                    新規登録後、自動で <b>/admins</b> に登録します（＝管理者になります）。
                    <br />
                    ※もしここで権限エラーが出る場合は、Firestoreルールの調整が必要です。
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** --- Not admin --- */
  if (!isAdmin) {
    return (
      <div style={ui.page}>
        <div style={{ ...ui.container, maxWidth: 720 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h1 style={{ margin: 0 }}>STORIA 電子カルテ（管理）</h1>
            <button style={ui.btnBase} onClick={logout}>
              ログアウト
            </button>
          </div>

          <div style={{ marginTop: 14, ...ui.card, borderColor: "#f2c6cf" }}>
            <div style={{ color: "#b00020", fontWeight: 900 }}>
              管理者権限がありません（/admins にあなたの UID が必要です）
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, lineHeight: 1.6 }}>
              UID：<b>{user.uid}</b>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** --- Main --- */
  return (
    <div style={ui.page}>
      <div style={ui.container}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>STORIA 電子カルテ（管理）</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>ログイン中：{user.email || user.uid}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {mode === "customer" && (
              <button
                style={ui.btnBase}
                onClick={() => {
                  setMode("list");
                  setSelectedCustomer(null);
                  setSelectedVisitId(null);
                }}
              >
                ← 顧客一覧へ
              </button>
            )}
            <button style={ui.btnBase} onClick={logout}>
              ログアウト
            </button>
          </div>
        </div>

        {/* list mode */}
        {mode === "list" && (
          <div style={{ maxWidth: 720 }}>
            <div style={ui.card}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>顧客一覧</div>

              <div style={{ display: "grid", gap: 10 }}>
                <input style={ui.input} placeholder="顧客名で検索" value={qText} onChange={(e) => setQText(e.target.value)} />

                <div style={ui.row}>
                  <input
                    style={{ ...ui.input, flex: 1 }}
                    placeholder="新規顧客名（例：山田 太郎）"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                  />
                  <button style={ui.btnPrimary} onClick={createCustomer}>
                    追加
                  </button>
                </div>

                <div style={{ marginTop: 6, display: "grid", gap: 10 }}>
                  {filteredCustomers.length === 0 && <div style={{ fontSize: 13, opacity: 0.7 }}>顧客がいません</div>}

                  {filteredCustomers.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        padding: 12,
                        border: "1px solid #ededed",
                        borderRadius: 14,
                        background: "#fff",
                        boxSizing: "border-box",
                      }}
                    >
                      <button
                        onClick={() => {
                          setSelectedCustomer(c);
                          setMode("customer");
                          resetFormForNewVisit();
                        }}
                        style={{
                          flex: 1,
                          textAlign: "left",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          padding: 0,
                          minWidth: 0,
                        }}
                      >
                        <div style={{ fontWeight: 900, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.displayName || "（名前未設定）"}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>最終：{c.lastVisitAt ? fmtDate(c.lastVisitAt) : "-"}</div>
                      </button>

                      <button style={ui.btnDanger} onClick={() => deleteCustomerAll(c.id)}>
                        顧客削除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* customer mode */}
        {mode === "customer" && selectedCustomer && (
          <div
            className={styles.adminGrid}
            style={{
              display: "grid",
              gridTemplateColumns: "1.15fr 1fr",
              gap: 14,
              alignItems: "start",
              maxWidth: 1200,
              minWidth: 0,
            }}
          >
            {/* left */}
            <div style={ui.card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>{selectedCustomer.displayName || "（名前未設定）"}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>来店履歴：{visits.length} 件</div>
                </div>

                <button style={ui.btnBase} onClick={resetFormForNewVisit}>
                  ＋ 新規カルテ
                </button>
              </div>

              <div style={{ marginTop: 12, ...ui.row }}>
                <input
                  style={{ ...ui.input, maxWidth: 320 }}
                  value={selectedCustomer.displayName || ""}
                  onChange={(e) => setSelectedCustomer((p) => (p ? { ...p, displayName: e.target.value } : p))}
                  placeholder="顧客名"
                />
                <button style={ui.btnBase} onClick={() => saveCustomerName(selectedCustomer.id, selectedCustomer.displayName || "")}>
                  名前を保存
                </button>

                <button style={ui.btnDanger} onClick={() => deleteCustomerAll(selectedCustomer.id)}>
                  顧客削除
                </button>
              </div>

              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                {visits.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 14,
                      border: selectedVisitId === v.id ? "1px solid #111" : "1px solid #ededed",
                      background: "#fff",
                      boxSizing: "border-box",
                    }}
                  >
                    <button
                      style={{
                        flex: 1,
                        textAlign: "left",
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        padding: 0,
                        minWidth: 0,
                      }}
                      onClick={() => loadVisitIntoForm(v)}
                    >
                      <div style={{ fontWeight: 900, fontSize: 14 }}>{fmtDate(v.visitAt)}</div>
                      <div style={{ fontSize: 12, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {v.menu ? `メニュー：${v.menu}` : ""}
                        {v.staffName ? ` / 担当：${v.staffName}` : ""}
                        {v.lineConsent ? ` / LINE：${v.lineConsent}` : ""}
                      </div>
                    </button>

                    <button style={ui.btnDanger} onClick={() => deleteVisit(v)}>
                      削除
                    </button>
                  </div>
                ))}

                {visits.length === 0 && (
                  <div style={{ fontSize: 13, opacity: 0.7 }}>
                    まだ来店履歴がありません。「＋ 新規カルテ」から追加できます。
                  </div>
                )}
              </div>
            </div>

            {/* right: editor */}
            <div style={ui.card}>
              <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>
                {selectedVisitId ? "カルテを編集（履歴をクリックで表示）" : "新規カルテを作成"}
              </div>

              <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
                <div>
                  <div style={ui.label}>来店日時</div>
                  <input style={ui.input} type="datetime-local" value={visitAtLocal} onChange={(e) => setVisitAtLocal(e.target.value)} />
                </div>

                <div style={ui.grid2}>
                  <div>
                    <div style={ui.label}>担当者</div>
                    {/* ★ここをSTORIAに */}
                    <input style={ui.input} placeholder="例：STORIA" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
                  </div>

                  <div>
                    <div style={ui.label}>LINE</div>
                    <select style={ui.input} value={lineConsent} onChange={(e) => setLineConsent(e.target.value as any)}>
                      <option value="">選択してください</option>
                      <option value="あり">あり</option>
                      <option value="なし">なし</option>
                    </select>
                  </div>

                  <div>
                    <div style={ui.label}>メニュー</div>
                    <input style={ui.input} placeholder="例：カット" value={menu} onChange={(e) => setMenu(e.target.value)} />
                  </div>

                  <div>
                    <div style={ui.label}>スタイル</div>
                    <input style={ui.input} placeholder="例：ショート" value={style} onChange={(e) => setStyle(e.target.value)} />
                  </div>

                  {/* ★サイド：刈り上げ/ツーブロック（選択） + mm */}
                  <div>
                    <div style={ui.label}>サイド</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <select style={ui.input} value={sideType} onChange={(e) => setSideType(e.target.value as any)}>
                        <option value="">選択</option>
                        <option value="刈り上げ">刈り上げ</option>
                        <option value="ツーブロック">ツーブロック</option>
                        <option value="なし">なし</option>
                      </select>
                      <input
                        style={ui.input}
                        placeholder="mm（例：3）"
                        inputMode="numeric"
                        value={sideMm}
                        onChange={(e) => setSideMm(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* ★バック：刈り上げ/ツーブロック（選択） + mm */}
                  <div>
                    <div style={ui.label}>バック</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <select style={ui.input} value={backType} onChange={(e) => setBackType(e.target.value as any)}>
                        <option value="">選択</option>
                        <option value="刈り上げ">刈り上げ</option>
                        <option value="ツーブロック">ツーブロック</option>
                        <option value="なし">なし</option>
                      </select>
                      <input
                        style={ui.input}
                        placeholder="mm（例：6）"
                        inputMode="numeric"
                        value={backMm}
                        onChange={(e) => setBackMm(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={ui.label}>スタイリング剤</div>
                    <input style={ui.input} placeholder="例：ワックス、グリース" value={styling} onChange={(e) => setStyling(e.target.value)} />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={ui.label}>その他</div>
                    <input style={ui.input} placeholder="例：次回は眉も整える" value={other} onChange={(e) => setOther(e.target.value)} />
                  </div>
                </div>

                <div>
                  <div style={ui.label}>メモ（施術内容・注意点など）</div>
                  <textarea
                    style={ui.textarea}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="例：サイドは短め、トップは流せる長さ。次回は眉も整える…など"
                  />
                </div>

                <div style={ui.divider} />

                <div style={{ fontSize: 13, fontWeight: 900 }}>施術写真（最大4枚）</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minWidth: 0 }}>
                  {[0, 1, 2, 3].map((i) => {
                    const url = photoPreview[i];
                    return (
                      <div
                        key={i}
                        style={{
                          border: "1px solid #ededed",
                          borderRadius: 14,
                          padding: 10,
                          background: "#fff",
                          overflow: "hidden",
                          boxSizing: "border-box",
                          minWidth: 0,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div style={{ fontWeight: 900, fontSize: 13 }}>写真 {i + 1}</div>
                          <button
                            style={{
                              padding: "6px 10px",
                              borderRadius: 999,
                              border: "1px solid #f2c6cf",
                              background: "#fff",
                              color: "#b00020",
                              cursor: "pointer",
                              fontWeight: 850,
                            }}
                            onClick={() => deletePhotoSlot(i + 1)}
                          >
                            削除
                          </button>
                        </div>

                        <div
                          style={{
                            marginTop: 8,
                            borderRadius: 12,
                            border: "1px dashed #e0e0e0",
                            background: "#fafafa",
                            height: 140,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                            cursor: url ? "pointer" : "default",
                          }}
                          onClick={() => {
                            if (url) setImgModalUrl(url);
                          }}
                          title={url ? "タップで拡大" : ""}
                        >
                          {url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={url} alt={`photo${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ fontSize: 12, opacity: 0.6 }}>プレビューなし</div>
                          )}
                        </div>

                        <div style={{ marginTop: 8 }}>
                          <label
                            style={{
                              display: "inline-block",
                              padding: "8px 10px",
                              borderRadius: 12,
                              border: "1px solid #e3e3e3",
                              cursor: "pointer",
                              background: "#fff",
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            ファイルを選択
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: "none" }}
                              onChange={(e) => onPickPhoto(i, e.target.files?.[0] || null)}
                            />
                          </label>

                          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
                            ※保存前でもプレビューされます（保存で反映）
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button style={ui.btnPrimary} onClick={saveVisit}>
                  {selectedVisitId ? "カルテを保存" : "カルテを追加して保存"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* image modal */}
        {imgModalUrl && (
          <div
            onClick={() => setImgModalUrl(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.65)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              zIndex: 9999,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(1000px, 95vw)",
                height: "min(720px, 85vh)",
                background: "#111",
                borderRadius: 18,
                overflow: "hidden",
                position: "relative",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <button
                onClick={() => setImgModalUrl(null)}
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  zIndex: 2,
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: "rgba(0,0,0,0.5)",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                閉じる
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgModalUrl}
                alt="preview-large"
                style={{ width: "100%", height: "100%", objectFit: "contain", background: "#111" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
