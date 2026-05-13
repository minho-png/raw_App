import { cn } from '@/lib/utils';
import { DMP_COLORS, DMP_COLOR_FALLBACK, DMP_LABELS } from '@/lib/colorPalettes';

// DMP 배지 — 색·라벨 정의는 lib/colorPalettes.ts 단일 source.
export function DmpBadge({ type }: { type: string }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border',
      DMP_COLORS[type] ?? DMP_COLOR_FALLBACK,
    )}>
      {DMP_LABELS[type] ?? type}
    </span>
  );
}
