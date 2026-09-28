import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { paginate, searchItems } from '../../utils/paging';

// A list that pages instead of growing: fixed-size pages side by side in a track you swipe
// (touch) or step through with ‹ › / the dots (and ←/→ when focused). Once there's more
// than one page it offers a search box. The caller orders the items — most important
// first — and renders each page. The pager sits at the bottom so side-by-side cards align.
// fitRows: a row selector — when the list sits in a fixed-height card (fitMedia matches),
// the page size becomes however many rows fit, so a page never scrolls inside itself.
export default function PagedList({ items, pageSize: basePageSize = 6, textOf, renderPage, label = 'items', searchPlaceholder = 'Search…', fitRows, fitMedia = '(min-width: 1100px)' }) {
  const [query, setQuery] = useState('');
  const [fitSize, setFitSize] = useState(null);
  const pageSize = fitSize || basePageSize;
  const [page, setPage] = useState(0);
  const trackRef = useRef(null);
  const searching = !!query.trim();
  const shown = useMemo(() => (searching ? searchItems(items, query, textOf) : items), [items, query, searching, textOf]);
  const pages = useMemo(() => paginate(shown, pageSize), [shown, pageSize]);
  const last = pages.length - 1;
  const canSearch = items.length > pageSize || searching;

  // Keep the current page valid as the list changes (done, dropped, filtered).
  useEffect(() => { if (page > last) go(last, false); }, [last]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { go(0, false); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!fitRows || !track || typeof ResizeObserver === 'undefined') return undefined;
    const mq = window.matchMedia(fitMedia);
    const measure = () => {
      if (!mq.matches) { setFitSize(null); return; }
      const rows = [...(track.querySelector('.pl-page') || track).querySelectorAll(fitRows)];
      if (!rows.length) return;
      const avg = rows.reduce((h, r) => h + r.getBoundingClientRect().height, 0) / rows.length;
      const fit = Math.max(2, Math.floor(track.clientHeight / Math.max(avg, 1)));
      setFitSize(prev => (prev === fit ? prev : fit));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    mq.addEventListener?.('change', measure);
    measure();
    return () => { ro.disconnect(); mq.removeEventListener?.('change', measure); };
  }, [fitRows, fitMedia, items.length]);

  const go = (i, smooth = true) => {
    const el = trackRef.current;
    const n = Math.max(0, Math.min(last, i));
    setPage(n);
    if (el) el.scrollTo({ left: n * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  };
  // Swiping (native scroll-snap) updates the page indicator.
  const onScroll = () => {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== page) setPage(i);
  };
  const onKey = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(page + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(page - 1); }
  };

  return (
    <div className="pl">
      {canSearch && (
        <label className="pl-search">
          <Search size={14} aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} aria-label={`Search ${label}`} />
          {searching && <button type="button" className="pl-clear" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
        </label>
      )}
      {searching && !shown.length ? (
        <p className="pl-none">No {label} match “{query.trim()}”.</p>
      ) : (
        <div
          ref={trackRef} className="pl-track" onScroll={onScroll} onKeyDown={onKey}
          tabIndex={pages.length > 1 ? 0 : -1} role="region" aria-roledescription="carousel" aria-label={`${label}, page ${page + 1} of ${pages.length}`}
        >
          {pages.map((pg, i) => (
            <div key={i} className="pl-page" aria-hidden={i !== page} inert={i !== page ? '' : undefined}>
              {renderPage(pg, { offset: i * pageSize, searching })}
            </div>
          ))}
        </div>
      )}
      {pages.length > 1 && (
        <div className="pl-pager">
          <button type="button" className="pl-arrow" onClick={() => go(page - 1)} disabled={page === 0} aria-label="Previous page"><ChevronLeft size={16} /></button>
          {pages.length <= 7 ? (
            <span className="pl-dots">
              {pages.map((_, i) => (
                <button key={i} type="button" className={`pl-dot ${i === page ? 'on' : ''}`} onClick={() => go(i)} aria-label={`Page ${i + 1}`} aria-current={i === page ? 'true' : undefined} />
              ))}
            </span>
          ) : (
            <span className="pl-count"><b>{page + 1}</b> / {pages.length}</span>
          )}
          <span className="pl-range">{page * pageSize + 1}–{Math.min(shown.length, (page + 1) * pageSize)} of {shown.length}</span>
          <button type="button" className="pl-arrow" onClick={() => go(page + 1)} disabled={page === last} aria-label="Next page"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
