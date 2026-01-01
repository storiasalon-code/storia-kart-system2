import { useEffect, useMemo, useState } from "react";
import styles from "../styles/premium.module.css";
import { httpsCallable } from "firebase/functions";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, User } from "firebase/auth";
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

import { auth, db, functions, storage } from "../src/lib/firebase";

function rand6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default function Admin() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [visitAt, setVisitAt] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState("");

  const [afterFiles, setAfterFiles] = useState<(File | null)[]>([null, null, null, null]);
  const [staffOnlyFile, setStaffOnlyFile] = useState<File | null>(null);

  const [linkCode, setLinkCode] = useState<string>("");

  const adminCreateCustomer = useMemo(() => httpsCallable(functions, "adminCreateCustomer"), []);
  const adminCreateLinkToken = useMemo(() => httpsCallable(functions, "adminCreateLinkToken"), []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) return setIsAdmin(false);
      const a = await getDoc(doc(db, "admins", u.uid));
      setIsAdmin(a.exists());
    });
    return () => unsub();
  }, []);

  async function login() {
    await signInWithEmailAndPassword(auth, email, pass);
  }

  async function logout() {
    await signOut(auth);
  }

  async function bootstrapMakeMeAdmin() {
    if (!auth.currentUser) return;
    await setDoc(doc(db, "admins", auth.currentUser.uid), { createdAt: serverTimestamp() }, { merge: true });
    setIsAdmin(true);
    alert("管理者化しました（初回のみ）。");
  }

  async function createCustomer() {
    if (!isAdmin) return alert("管理者ではありません");
    const res: any = await adminCreateCustomer({ displayName, consent: true });
    const newId = res.data.customerId as string;
    setCustomerId(newId);
    alert(`顧客作成: ${newId}`);
  }

  async function createLinkCode() {
    if (!isAdmin) return alert("管理者ではありません");
    if (!customerId) return alert("customerIdを入力してください");
    const token = rand6();
    await adminCreateLinkToken({ customerId, token, ttlMinutes: 15 });
    setLinkCode(token);
    alert(`リンクコード（15分有効）: ${token}`);
  }

  async function addVisit() {
    if (!isAdmin) return alert("管理者ではありません");
    if (!customerId) return alert("customerIdを入力してください");

    const visitDate = new Date(visitAt);
    const vRef = await addDoc(collection(db, "customers", customerId, "visits"), {
      visitAt: visitDate.getTime(),
      note: note || "",
      photos: {},
      staffOnly: {},
      createdAt: Date.now(),
      createdBy: auth.currentUser?.uid || ""
    });

    const visitId = vRef.id;

    const photoPaths: any = {};
    for (let i = 0; i < 4; i++) {
      const f = afterFiles[i];
      if (!f) continue;
      const path = `customers/${customerId}/visits/${visitId}/after_${i + 1}.jpg`;
      await uploadBytes(ref(storage, path), f, { contentType: f.type || "image/jpeg" });
      photoPaths[`after${i + 1}Path`] = path;
    }

    let staffPath: string | null = null;
    if (staffOnlyFile) {
      staffPath = `customers/${customerId}/visits/${visitId}/staff_only.jpg`;
      await uploadBytes(ref(storage, staffPath), staffOnlyFile, { contentType: staffOnlyFile.type || "image/jpeg" });
    }

    await updateDoc(doc(db, "customers", customerId, "visits", visitId), {
      photos: photoPaths,
      staffOnly: { staffPhotoPath: staffPath }
    });

    // customer latest update
    await setDoc(doc(db, "customers", customerId), {
      lastVisitAt: visitDate.getTime(),
      latestVisitId: visitId
    }, { merge: true });

    alert("来店記録を追加しました");
    setNote("");
    setAfterFiles([null, null, null, null]);
    setStaffOnlyFile(null);
  }

  // UI
  if (!user) {
    return (
      <div className={styles.page}>
        <div className={styles.adminShell}>
          <div className={styles.topbar}>
            <div className={styles.brand}>
              <div className={styles.back} aria-hidden><span style={{ fontSize: 18, opacity: 0.9 }}>‹</span></div>
              <div>
                <div className={styles.title}>管理画面</div>
                <div className={styles.subtitle}>STORIA / Admin (iPad)</div>
              </div>
            </div>
            <div className={styles.statusPill}>ログイン</div>
          </div>

          <div className={styles.card} style={{ marginTop: 14, maxWidth: 520 }}>
            <div className={styles.cardInner}>
              <div className={styles.field}>
                <div className={styles.label}>Email</div>
                <input className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
              </div>
              <div className={styles.field} style={{ marginTop: 10 }}>
                <div className={styles.label}>Password</div>
                <input className={styles.input} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="password" type="password" />
              </div>
              <button className={styles.btnPrimary} style={{ width: "100%", marginTop: 12 }} onClick={login}>ログイン</button>
              <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12, lineHeight: 1.6 }}>
                Firebase Authentication（Email/Password）でユーザーを作成してからログインしてください。
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.adminShell}>
        <div className={styles.topbar}>
          <div className={styles.brand}>
            <div className={styles.back} aria-hidden><span style={{ fontSize: 18, opacity: 0.9 }}>‹</span></div>
            <div>
              <div className={styles.title}>管理画面</div>
              <div className={styles.subtitle}>STORIA / Admin (iPad)</div>
            </div>
          </div>
          <div className={styles.statusPill}>編集者</div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span className={styles.pill}>UID: {user.uid}</span>
          <span className={styles.pill}>Admin: {isAdmin ? "Yes" : "No"}</span>
          <button className={styles.btnGhost} onClick={logout}>ログアウト</button>
        </div>

        {!isAdmin && (
          <div className={styles.card} style={{ marginTop: 12, maxWidth: 720 }}>
            <div className={styles.cardInner}>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>初回のみ：自分を管理者に登録</div>
              <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.6 }}>
                最初の1回だけ押してください（運用開始後はボタンを削除推奨）。
              </div>
              <button className={styles.btnPrimary} style={{ marginTop: 10 }} onClick={bootstrapMakeMeAdmin}>
                自分を管理者にする
              </button>
            </div>
          </div>
        )}

        <div className={styles.adminGrid}>
          <div className={styles.card}>
            <div className={styles.cardInner}>
              <div className={styles.sectionTitle} style={{ padding: 0, marginBottom: 10 }}>顧客</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className={styles.field}>
                  <div className={styles.label}>顧客ID</div>
                  <input className={styles.input} value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="顧客ID（既存なら入力）" />
                </div>
                <div className={styles.field}>
                  <div className={styles.label}>名前（任意）</div>
                  <input className={styles.input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="表示名" />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <button className={styles.btnGhost} onClick={createCustomer}>顧客作成</button>
                <button className={styles.btnGhost} onClick={createLinkCode}>リンクコード発行</button>
                {linkCode && <span className={styles.kbd}>コード: {linkCode}</span>}
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardInner}>
              <div className={styles.sectionTitle} style={{ padding: 0, marginBottom: 10 }}>来店記録を追加</div>

              <div className={styles.field}>
                <div className={styles.label}>来店日時</div>
                <input className={styles.input} type="datetime-local" value={visitAt} onChange={(e) => setVisitAt(e.target.value)} />
              </div>

              <div className={styles.field} style={{ marginTop: 12 }}>
                <div className={styles.label}>メモ（自由欄）</div>
                <textarea className={styles.textarea} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              <hr className={styles.hr} />

              <div className={styles.sectionTitle} style={{ padding: 0, marginBottom: 10 }}>施術写真（お客様共有：最大4枚）</div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                {[0,1,2,3].map((i) => (
                  <div className={styles.fileBox} key={i}>
                    <div style={{ marginBottom: 8, fontWeight: 650 }}>写真 {i+1}</div>
                    <input type="file" accept="image/*" onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setAfterFiles(prev => {
                        const next = [...prev];
                        next[i] = f;
                        return next;
                      });
                    }} />
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12 }} className={styles.fileBox}>
                <div style={{ fontWeight: 750, marginBottom: 6 }}>スタッフ専用写真（共有しない / 編集者のみ閲覧）</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                  例：頭皮状態の記録、薬剤メモ、注意事項の写真など
                </div>
                <input type="file" accept="image/*" onChange={(e) => setStaffOnlyFile(e.target.files?.[0] || null)} />
              </div>

              <button className={styles.btnPrimary} style={{ width: "100%", marginTop: 14, padding: 14, fontSize: 16 }} onClick={addVisit}>
                保存
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, opacity: 0.75, fontSize: 12, lineHeight: 1.6 }}>
          ※この画面は最小構成です（顧客検索や編集履歴などは必要に応じて追加）。
        </div>
      </div>
    </div>
  );
}
