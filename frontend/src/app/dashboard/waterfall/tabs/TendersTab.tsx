"use client";

export function TendersTab({ waterfall }: { waterfall: any }) {
  const positions: any[] = waterfall.positions ?? [];
  const tenders = positions.flatMap((p) =>
    (p.tenders ?? []).map((t: any) => ({ ...t, position: p }))
  );

  if (tenders.length === 0) {
    return <div className="text-sm text-gray-500 text-center py-8">No tenders sent yet.</div>;
  }

  tenders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-3 text-sm">
      {tenders.map((t) => {
        const cls =
          t.status === "ACCEPTED" ? "border-green-300 bg-green-50/40" :
          t.status === "DECLINED" ? "border-red-200 bg-red-50/30" :
          t.status === "EXPIRED" ? "border-gray-200 bg-gray-50" :
          "border-[#BA7517]/40 bg-[#FAEEDA]/30";
        return (
          <div key={t.id} className={`border rounded-lg p-3 ${cls}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-gray-900">Position #{t.position.position}</div>
                <div className="text-[11px] text-gray-500">
                  Sent {new Date(t.createdAt).toLocaleString()}
                </div>
              </div>
              <span className="px-2 py-0.5 text-[10px] rounded bg-white/60 text-gray-700 font-medium">{t.status}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-600">
              <div>Rate: <span className="text-gray-900">${Number(t.offeredRate).toLocaleString()}</span></div>
              <div>Expires: <span className="text-gray-900">{new Date(t.expiresAt).toLocaleTimeString()}</span></div>
              {t.respondedAt && (
                <div>Responded: <span className="text-gray-900">{new Date(t.respondedAt).toLocaleTimeString()}</span></div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
