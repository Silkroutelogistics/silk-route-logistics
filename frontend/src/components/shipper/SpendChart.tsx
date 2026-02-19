"use client";

export function SpendChart({
  data,
  labels,
  highlightLast = false,
  height = 100,
  showValues = false,
  colorFn,
}: {
  data: number[];
  labels: string[];
  highlightLast?: boolean;
  height?: number;
  showValues?: boolean;
  colorFn?: (value: number, index: number) => string;
}) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((v, i) => {
        const barHeight = (v / max) * (height - 20);
        const bg = colorFn
          ? colorFn(v, i)
          : highlightLast && i === data.length - 1
          ? "#C9A84C"
          : "rgba(13, 27, 42, 0.20)";
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            {showValues && <span className="text-[9px] text-gray-400">${(v / 1000).toFixed(1)}k</span>}
            <div
              className="w-full rounded-t"
              style={{ height: barHeight, background: bg, transition: "height 0.5s ease" }}
            />
            <span className="text-[8px] text-gray-400">{labels[i]}</span>
          </div>
        );
      })}
    </div>
  );
}
