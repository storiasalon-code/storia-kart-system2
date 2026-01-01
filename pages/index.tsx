import { useEffect, useMemo, useState } from "react";
import styles from "../styles/premium.module.css";
import { httpsCallable } from "firebase/functions";
import { signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from "firebase/firestore";

import { auth, db, functions } from "../src/lib/firebase";
import { initLiff, getLineUserId } from "../src/lib/liff";
import { loadImageObjectUrl } from "../src/lib/imageBytes";

type Visit = {
  id: string;
  visitAt: number;
  note: string;
  photos?: {
    after1Path?: string;
    after2Path?: string;
    after3Path?: string;
    after4Path?: string;
  };
};

export default function Customer() {
  const [phase, setPhase] = useState<"boot" | "need_link" | "ready" | "error">("boot");
  const [tab, setTab] = useState<"latest" | "history">("latest");
  const [lineUserId, setLineUserId] = useState("");
  const [tokenInput, setTokenInput] = useState("");

  const [latestVisit, setLatestVisit] = useState<Visit | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selected, setSelected] = useState<Visit | null>(null);

  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const customerLogin = useMemo(() => httpsCallable(functions, "customerLogin"), []);

  useEffect(() => onAuthStateChanged(auth, () => {}), []);

  useEffect(() => {
    (async () => {
      try {
        await initLiff();
        const uid = await getLineUserId();
        setLineUserId(uid);

        // リンク済みなら token無しでログイン
        try {
          const res: any = await customerLogin({ lineUserId: uid });
          await signInWithCustomToken(auth, res.data.customToken);
          setPhase("ready");
        } catch {
          setPhase("need_link");
        }
      } catch (e) {
        console.error(e);
        setPhase("error");
      }
    })();
  }, [customerLogin]);

  async function handleLink() {
    try {
      const res: any = await customerLogin({ lineUserId, linkToken: tokenInput.trim() });
      await signInWithCustomToken(auth, res.data.customToken);
      setPhase("ready");
    } catch (e) {
      alert("コードが違うか、期限切れです。スタッフに確認してください。");
    }
  }

  async function loadVisits() {
    if (!auth.currentUser) return;
    const customerId = auth.currentUser.uid;

    const customerDoc = await getDoc(doc(db, "customers", customerId));
    if (customerDoc.exists()) {
      const latestVisitId = customerDoc.data().latestVisitId as string | null;
      if (latestVisitId) {
        const vDoc = await getDoc(doc(db, "customers", customerId, "visits", latestVisitId));
        if (vDoc.exists()) setLatestVisit({ id: vDoc.id, ...(vDoc.data() as any) });
      }
    }

    const q = query(
      collection(db, "customers", customerId, "visits"),
      orderBy("visitAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(q);
    setVisits(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
  }

  useEffect(() => {
    if (phase === "ready" && auth.currentUser) {
      loadVisits().catch(console.error);
    }
  }, [phase]);

  const viewVisit = selected ?? latestVisit;

  async function ensureImages(v: Visit) {
    const paths = [
      v.photos?.after1Path,
      v.photos?.after2Path,
      v.photos?.after3Path,
      v.photos?.after4Path
    ].filter(Boolean) as string[];

    const next = { ...imageUrls };
    for (const p of paths) {
      if (!next[p]) next[p] = await loadImageObjectUrl(p);
    }
    setImageUrls(next);
  }

  useEffect(() => {
    if (viewVisit) ensureImages(viewVisit).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewVisit?.id]);

  if (phase === "boot") return <div className={styles.page}><div className={styles.shell}>起動中...</div></div>;
  if (phase === "error") return <div className={styles.page}><div className={styles.shell}>エラーが発生しました。開き直してください。</div></div>;

  if (phase === "need_link") {
    return (
      <div className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.topbar}>
            <div className={styles.brand}>
              <div className={styles.back} aria-hidden><span style={{ fontSize: 18, opacity: 0.9 }}>‹</span></div>
              <div>
                <div className={styles.title}>カルテ</div>
                <div className={styles.subtitle}>STORIA / Customer View</div>
              </div>
            </div>
            <div className={styles.statusPill}>初回連携</div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardInner}>
              <div className={styles.label}>6桁コード（15分有効）</div>
              <input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="例：482915"
                className={styles.input}
                style={{ marginTop: 10, fontSize: 18 }}
              />
              <button className={styles.btnPrimary} style={{ width: "100%", marginTop: 12 }} onClick={handleLink}>
                連携する
              </button>
              <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12, lineHeight: 1.6 }}>
                スタッフから渡されたコードを入力してください。
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ready
  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <div className={styles.brand}>
            <div className={styles.back} aria-hidden><span style={{ fontSize: 18, opacity: 0.9 }}>‹</span></div>
            <div>
              <div className={styles.title}>カルテ</div>
              <div className={styles.subtitle}>STORIA / Customer View</div>
            </div>
          </div>
          <div className={styles.statusPill}>閲覧専用</div>
        </div>

        <div className={styles.segment} role="tablist" aria-label="tabs">
          <button
            className={`${styles.segBtn} ${tab === "latest" ? styles.segBtnActive : ""}`}
            onClick={() => { setTab("latest"); setSelected(null); }}
            role="tab"
            aria-selected={tab === "latest"}
          >
            最新
          </button>
          <button
            className={`${styles.segBtn} ${tab === "history" ? styles.segBtnActive : ""}`}
            onClick={() => setTab("history")}
            role="tab"
            aria-selected={tab === "history"}
          >
            履歴
          </button>
        </div>

        <div className={styles.card}>
          <div className={styles.cardInner}>
            <div className={styles.labelRow}>
              <div>
                <div className={styles.label}>来店日</div>
                <div className={styles.value}>{viewVisit ? new Date(viewVisit.visitAt).toLocaleString() : "—"}</div>
              </div>
              <div className={styles.pillRow}>
                <span className={styles.pill}>写真 {viewVisit?.photos ? Object.values(viewVisit.photos).filter(Boolean).length : 0}/4</span>
                <span className={styles.pill}>カルテ共有</span>
              </div>
            </div>

            <div className={styles.note}>{viewVisit?.note || "まだ記録がありません。"}</div>

            {viewVisit?.photos && (
              <div className={styles.grid}>
                {[viewVisit.photos.after1Path, viewVisit.photos.after2Path, viewVisit.photos.after3Path, viewVisit.photos.after4Path]
                  .filter(Boolean)
                  .map((p, idx) => (
                    <div className={styles.photo} key={p}>
                      <span className={styles.photoTag}>{["Front","Side","Back","Detail"][idx] || `#${idx+1}`}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrls[p!]} alt={`after-${idx + 1}`} />
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className={styles.sectionTitle}>履歴</div>
          <ul className={styles.list}>
            {visits.map((v) => (
              <li key={v.id} className={styles.listItem}>
                <button
                  className={styles.listBtn}
                  onClick={() => { setTab("history"); setSelected(v); }}
                >
                  <span>{new Date(v.visitAt).toLocaleString()}</span>
                  <span className={styles.chev}>›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {tab === "history" && selected && (
          <div style={{ marginTop: 12 }}>
            <button className={styles.btnGhost} onClick={() => setSelected(null)}>最新に戻る</button>
          </div>
        )}
      </div>
    </div>
  );
}
