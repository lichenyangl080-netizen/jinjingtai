import { useEffect, useRef, useState } from "react";
import type { ConnectionCheck, Status } from "./ipc-contract";

/** A connection attempt belongs to the workspace, not the settings page. */
export function useConnectionSession(
  libraryId: string,
  installed: boolean,
  capture: Status | null,
) {
  const [checking, setChecking] = useState(false);
  const [environment, setEnvironment] = useState<ConnectionCheck | null>(null);
  const [checkError, setCheckError] = useState("");
  const [baseline, setBaseline] = useState<string[] | null>(null);
  const [trustDone, setTrustDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const request = useRef(0);
  const scope = libraryId + ":" + installed;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    request.current++;
    setEnvironment(null);
    setCheckError("");
    setChecking(false);
    setBaseline(null);
    setTrustDone(false);
    setCopied(false);
  }, [scope]);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const received = baseline
    ? capture?.stages.find(
        (stage) => stage.binding === "bound" && !baseline.includes(stage.id),
      )
    : undefined;
  async function checkEnvironment() {
    const id = ++request.current;
    setChecking(true);
    setCheckError("");
    try {
      const value = await window.jinjingtai!.checkConnection(libraryId);
      if (request.current === id && currentScope.current === scope)
        setEnvironment(value);
    } catch {
      if (request.current === id && currentScope.current === scope)
        setCheckError(
          "未能完成检查，请重新检查或在 Codex 中确认程序与登录状态。",
        );
    } finally {
      if (request.current === id && currentScope.current === scope)
        setChecking(false);
    }
  }
  async function copyPrompt() {
    const id = request.current;
    try {
      await navigator.clipboard.writeText(
        "请在本工作目录完成正常工作后，按进境台收尾规则记录本轮实际变化；没有新增时如实记录 no_change，不要为连通性测试编造进展。",
      );
      if (request.current === id && currentScope.current === scope)
        setCopied(true);
    } catch {
      if (request.current === id && currentScope.current === scope) {
        setCopied(false);
        setCheckError("无法复制，请按上面的步骤完成正常工作收尾。");
      }
    }
  }
  return {
    checking,
    environment,
    checkError,
    waiting: baseline !== null,
    trustDone,
    copied,
    received,
    checkEnvironment,
    copyPrompt,
    toggleTrust() {
      setTrustDone(!trustDone);
      if (trustDone) setBaseline(null);
    },
    waitForReceipt() {
      setBaseline((capture?.stages || []).map((stage) => stage.id));
    },
  };
}

export type ConnectionSession = ReturnType<typeof useConnectionSession>;
