import { useState } from "react";
import { Action } from "./Controls";
import { api, formatDate } from "../workspace-runtime";

export function MaterialReview({
  id,
  close,
  viewDate,
}: {
  id: string;
  close: () => void;
  viewDate: (date: string) => void;
}) {
  const [result] = useState(() => {
    try {
      return api("job-materials", id);
    } catch {
      return null;
    }
  });
  return (
    <div className="modal-backdrop">
      <section
        className="dialog scope-dialog daily-scope-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-title"
      >
        <header>
          <h2 id="material-title">待处理材料</h2>
          <p>{result ? formatDate(result.date) : "读取失败，原材料仍保留。"}</p>
        </header>
        <div className="scope-body">
          {result?.items.map((item) => (
            <section className="material-review-item" key={item.id}>
              <strong>{item.title}</strong>
              <p>{item.summary}</p>
              <span>
                {item.protected
                  ? "相关记录已保存、修改或仅选了部分来源，本次未替换。"
                  : "本次未纳入成果；可回到当天重新选择整理范围。"}
              </span>
            </section>
          ))}
          {result && !result.items.length && <p>没有待处理材料。</p>}
        </div>
        <footer className="dialog-actions">
          <Action onClick={close}>关闭</Action>
          {result && (
            <Action ink onClick={() => viewDate(result.date)}>
              查看这一天
            </Action>
          )}
        </footer>
      </section>
    </div>
  );
}
