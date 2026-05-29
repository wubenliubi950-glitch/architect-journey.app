"use client";

import { useEffect, useState } from "react";

/** いずれかの外部APIがモック動作のとき、デモであることを知らせるバナー */
export function DemoBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => {
        if (active) setShow(Boolean(d.anyMock));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!show) return null;

  return (
    <div className="bg-amber-100 px-5 py-1.5 text-center text-[11px] leading-snug text-amber-800">
      デモデータで動作中 — 交通費・ホテル・建築情報はサンプルです
    </div>
  );
}
