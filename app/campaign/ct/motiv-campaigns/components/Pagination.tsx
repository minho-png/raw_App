"use client";

interface Props {
  currentPage: number;
  lastPage: number;
  total: number;
  perPage: number;
  onChangePage: (page: number) => void;
  onChangePerPage: (perPage: number) => void;
}

const PER_PAGE_OPTIONS = [20, 50, 100, 200];

export function Pagination({
  currentPage,
  lastPage,
  total,
  perPage,
  onChangePage,
  onChangePerPage,
}: Props) {
  const pageWindow = buildPageWindow(currentPage, lastPage);

  return (
    <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm md:flex-row">
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>
          전체 <strong className="text-gray-800">{total.toLocaleString('ko-KR')}</strong>건 · {currentPage}/{lastPage} 페이지
        </span>
        <select
          value={perPage}
          onChange={(e) => onChangePerPage(Number(e.target.value))}
          className="rounded border border-gray-300 px-2 py-1 text-xs"
        >
          {PER_PAGE_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v}개씩
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <PageBtn disabled={currentPage <= 1} onClick={() => onChangePage(1)}>
          «
        </PageBtn>
        <PageBtn disabled={currentPage <= 1} onClick={() => onChangePage(currentPage - 1)}>
          ‹
        </PageBtn>
        {pageWindow.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-2 text-xs text-gray-400">…</span>
          ) : (
            <PageBtn key={p} active={p === currentPage} onClick={() => onChangePage(p)}>
              {p}
            </PageBtn>
          ),
        )}
        <PageBtn disabled={currentPage >= lastPage} onClick={() => onChangePage(currentPage + 1)}>
          ›
        </PageBtn>
        <PageBtn disabled={currentPage >= lastPage} onClick={() => onChangePage(lastPage)}>
          »
        </PageBtn>
      </div>
    </div>
  );
}

function PageBtn({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[32px] rounded border px-2 py-1 text-xs font-semibold transition ${
        active
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function buildPageWindow(current: number, last: number): (number | '...')[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(last - 1, current + 1);
  if (start > 2) pages.push('...');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < last - 1) pages.push('...');
  pages.push(last);
  return pages;
}
