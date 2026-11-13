import { useState } from 'react';

/** Reset on view changes and clamp after deletions without waiting for an effect. */
export default function usePagination(total, pageSize, resetKey = '') {
  const key = JSON.stringify([pageSize, resetKey]);
  const [position, setPosition] = useState({ key, page: 1 });
  const pages = Math.max(1, Math.ceil(total / (pageSize || Math.max(total, 1))));
  const page = Math.min(pages, position.key === key ? position.page : 1);
  const start = pageSize ? (page - 1) * pageSize : 0;
  return { page, pages, total, start, end: pageSize ? Math.min(start + pageSize, total) : total,
    setPage: (next) => setPosition({ key, page: Math.max(1, Math.min(next, pages)) }) };
}
