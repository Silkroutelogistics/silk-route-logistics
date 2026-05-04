"use client";

export function ActivityTab({ load }: { load: any }) {
  const activities: any[] = load.loadActivities ?? [];

  if (activities.length === 0) {
    return <div className="text-sm text-gray-500 text-center py-8">No activity yet.</div>;
  }

  return (
    <ol className="space-y-3 text-sm">
      {activities.map((a) => (
        <li key={a.id} className="flex gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-[#BA7517] mt-2 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <div className="text-xs text-gray-500 shrink-0">
                {new Date(a.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </div>
              <div className="text-[10px] uppercase text-gray-400">{a.actorType}</div>
            </div>
            <div className="text-white">{a.description}</div>
            {a.actorName && <div className="text-xs text-gray-500">{a.actorName}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
