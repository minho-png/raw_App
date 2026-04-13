import { cn } from '@/lib/utils';

const DMP_COLORS: Record<string, string> = {
  SKP: 'bg-blue-100 text-blue-700', KB: 'bg-emerald-100 text-emerald-700',
  LOTTE: 'bg-red-100 text-red-700', TG360: 'bg-purple-100 text-purple-700',
  WIFI: 'bg-cyan-100 text-cyan-700', BC: 'bg-orange-100 text-orange-700',
  SH: 'bg-pink-100 text-pink-700', HyperLocal: 'bg-purple-100 text-purple-700',
  MEDIA_TARGETING: 'bg-green-100 text-green-700',
  DIRECT: 'bg-slate-100 text-slate-500',
};

const DMP_LABELS: Record<string, string> = {
  MEDIA_TARGETING: '매체 타게팅',
};

export function DmpBadge({ type }: { type: string }) {
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-bold', DMP_COLORS[type] ?? 'bg-slate-100 text-slate-500')}>{DMP_LABELS[type] ?? type}</span>;
}
