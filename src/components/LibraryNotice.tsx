import { storageMessage } from "../workspace-runtime";
import { Action } from "./Controls";

export function LibraryNotice({
  failure,
  reload,
  path,
}: {
  failure: string;
  reload: () => void;
  path?: string | null;
}) {
  return (
    <section className="library-error" role="alert">
      <h2>{storageMessage(failure)}</h2>
      <p>
        当前无法核实本地资料，不能按“没有记录”理解。请检查保存位置，恢复读取后再继续。
      </p>
      {path && <p className="library-error-path">{path}</p>}
      <Action ink onClick={reload}>
        重新读取
      </Action>
    </section>
  );
}
