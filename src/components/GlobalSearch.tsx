import { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { IconButton } from "./Controls";
import type { Store } from "../model";
import type { SearchQuery, SearchResult } from "../search-index";
import { projectLabel } from "../project-display";
function highlight(text: string, query: string) {
  const tokens = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const folded = text.toLocaleLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let hit = text.length,
      length = 0;
    for (const token of tokens) {
      const at = folded.indexOf(token, cursor);
      if (at >= 0 && (at < hit || (at === hit && token.length > length))) {
        hit = at;
        length = token.length;
      }
    }
    if (!length) {
      parts.push(text.slice(cursor));
      break;
    }
    if (hit > cursor) parts.push(text.slice(cursor, hit));
    parts.push(<mark key={hit}>{text.slice(hit, hit + length)}</mark>);
    cursor = hit + length;
  }
  return parts;
}
export function GlobalSearch({
  store,
  libraryId,
  open,
  close,
  onOpen,
  focusTarget = "result",
}: {
  store: Store;
  libraryId: string;
  open: boolean;
  close: () => void;
  onOpen: (result: SearchResult, sequence: string[]) => void;
  focusTarget?: "input" | "result";
}) {
  const initial: SearchQuery = {
    text: "",
    project: "",
    start: "",
    end: "",
    type: "",
    evidence: false,
    historical: false,
  };
  const [query, setQuery] = useState(initial),
    [results, setResults] = useState<SearchResult[]>([]),
    [page, setPage] = useState(0),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const worker = useRef<Worker | null>(null),
    generation = useRef(0),
    request = useRef(0),
    currentPage = useRef(page),
    scroll = useRef(0),
    openedResult = useRef(""),
    restoreFocus = useRef(true),
    list = useRef<HTMLDivElement>(null);
  currentPage.current = page;
  useEffect(() => {
    const w = new Worker(new URL("../search.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = ({ data }) => {
      if (
        data.type === "results" &&
        data.generation === generation.current &&
        data.requestId === request.current
      ) {
        setResults(data.results);
        const lastPage = Math.max(0, Math.ceil(data.results.length / 50) - 1);
        if (currentPage.current > lastPage) {
          setPage(lastPage);
          scroll.current = 0;
          list.current?.scrollTo(0, 0);
        }
        setPending(false);
      }
    };
    w.onerror = () => {
      setError("本地搜索暂不可用，请重新打开软件后重试。");
      setPending(false);
    };
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);
  useEffect(() => {
    generation.current++;
    request.current++;
    setResults([]);
    setPending(true);
    worker.current?.postMessage({
      type: "index",
      store,
      libraryId,
      generation: generation.current,
    });
  }, [store, libraryId]);
  useEffect(() => {
    setQuery(initial);
    setPage(0);
    scroll.current = 0;
    openedResult.current = "";
    restoreFocus.current = false;
  }, [libraryId]);
  useEffect(() => {
    setPending(true);
    const id = ++request.current;
    const timer = setTimeout(
      () =>
        worker.current?.postMessage({
          type: "query",
          query,
          requestId: id,
          generation: generation.current,
        }),
      150,
    );
    return () => clearTimeout(timer);
  }, [query, store, libraryId]);
  useEffect(() => {
    if (open && list.current) list.current.scrollTop = scroll.current;
  }, [open]);
  useEffect(() => {
    if (!open) {
      restoreFocus.current = true;
      return;
    }
    if (!restoreFocus.current || pending) return;
    const frame = requestAnimationFrame(() => {
      const result = Array.from(
        list.current?.querySelectorAll<HTMLButtonElement>(
          "[data-search-result]",
        ) || [],
      ).find((button) => button.dataset.searchResult === openedResult.current);
      const target =
        (focusTarget === "result" ? result : null) ||
        document.querySelector<HTMLInputElement>('[aria-label="全文搜索"]');
      if (target) {
        target.focus({ preventScroll: true });
        restoreFocus.current = false;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, pending, results, page, focusTarget]);
  function update(patch: Partial<SearchQuery>) {
    request.current++;
    setPending(true);
    setResults([]);
    setQuery((q) => ({ ...q, ...patch }));
    setPage(0);
    scroll.current = 0;
    openedResult.current = "";
    restoreFocus.current = false;
    list.current?.scrollTo(0, 0);
  }
  if (!open) return null;
  const shown = results.slice(page * 50, (page + 1) * 50);
  return (
    <div className="modal-backdrop">
      <section
        className="dialog search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-search-title"
      >
        <header className="section-head">
          <h2 id="global-search-title">搜索本地资料</h2>
          <IconButton label="关闭搜索" onClick={close}>
            <X />
          </IconButton>
        </header>
        <input
          autoFocus
          type="search"
          aria-label="全文搜索"
          placeholder="输入正文、心得或事项中的词"
          value={query.text}
          onChange={(e) => update({ text: e.target.value })}
        />
        <div className="search-filters">
          <label>
            项目
            <select
              aria-label="搜索项目"
              value={query.project}
              onChange={(e) => update({ project: e.target.value })}
            >
              <option value="">全部项目</option>
              {store.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.workspace ? ` · ${p.workspace}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            起始日期
            <input
              type="date"
              aria-label="搜索起始日期"
              value={query.start}
              onChange={(e) => update({ start: e.target.value })}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              aria-label="搜索结束日期"
              value={query.end}
              onChange={(e) => update({ end: e.target.value })}
            />
          </label>
          <label>
            内容
            <select
              aria-label="搜索内容类型"
              value={query.type}
              onChange={(e) =>
                update({ type: e.target.value as SearchQuery["type"] })
              }
            >
              <option value="">全部内容</option>
              <option value="record">记录</option>
              <option value="note">心得与下一步</option>
              <option value="project">项目概况</option>
              <option value="continuation">继续起点</option>
              <option value="review">周期回望</option>
              <option value="thread">事项主线</option>
            </select>
          </label>
        </div>
        <div className="search-options">
          <label>
            <input
              type="checkbox"
              checked={query.evidence}
              onChange={(e) => update({ evidence: e.target.checked })}
            />
            搜索已保存依据
          </label>
          <label>
            <input
              type="checkbox"
              checked={query.historical}
              onChange={(e) => update({ historical: e.target.checked })}
            />
            包含历史结论
          </label>
        </div>
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : (
          <p role="status" className="muted">
            {pending
              ? "正在检索…"
              : query.text.trim()
                ? `${results.length} 项结果`
                : "输入关键词开始搜索，多个词需全部命中。"}
          </p>
        )}
        <div
          className="search-results"
          ref={list}
          onScroll={(e) => (scroll.current = e.currentTarget.scrollTop)}
        >
          {!pending && query.text.trim() && !results.length && !error && (
            <p className="muted">没有找到符合条件的内容。</p>
          )}
          {shown.map((r) => (
            <button
              className="search-result"
              key={`${r.kind}:${r.id}`}
              data-search-result={`${r.kind}:${r.id}`}
              disabled={pending}
              onClick={() => {
                if (pending) return;
                openedResult.current = `${r.kind}:${r.id}`;
                onOpen(
                  r,
                  results
                    .filter((x) => x.kind === "record")
                    .map((x) => x.recordId || x.id),
                );
              }}
            >
              <strong>{r.title}</strong>
              <span className="search-result-meta">
                {
                  (
                    {
                      record: "记录",
                      note: "心得",
                      project: "项目概况",
                      continuation: "继续起点",
                      review: "周期回望",
                      thread: "事项主线",
                    } as const
                  )[r.kind]
                }{" "}
                · {r.date}
                {r.historical ? " · 历史结论" : ""}
                {r.project
                  ? ` · ${(() => {
                      const project = store.projects.find(
                        (p) => p.id === r.project,
                      );
                      return project
                        ? projectLabel(project, store.projects)
                        : "其他";
                    })()}`
                  : ""}
              </span>
              <span>{highlight(r.snippet, query.text)}</span>
            </button>
          ))}
        </div>
        {results.length > 50 && (
          <div className="dialog-actions">
            <button
              disabled={!page}
              onClick={() => {
                setPage(page - 1);
                scroll.current = 0;
                list.current?.scrollTo(0, 0);
              }}
            >
              上一页
            </button>
            <span>
              {page + 1} / {Math.ceil(results.length / 50)}
            </span>
            <button
              disabled={(page + 1) * 50 >= results.length}
              onClick={() => {
                setPage(page + 1);
                scroll.current = 0;
                list.current?.scrollTo(0, 0);
              }}
            >
              下一页
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
