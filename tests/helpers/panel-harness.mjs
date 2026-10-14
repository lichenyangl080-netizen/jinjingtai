import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as model from "../../src/model.ts";
import * as personal from "../../src/personal-workspace.ts";
import * as projectDisplay from "../../src/project-display.ts";
import * as commands from "../../src/personal-commands.ts";
import * as usage from "../../src/record-usage.ts";

const { transpileModule, ModuleKind, ScriptTarget, JsxEmit } = createRequire(
  import.meta.url,
)("typescript");
export const Action = () => {};

// Exercise the real component callbacks with queued guards and persistent hooks.
// Desktop QA separately verifies DOM, focus, IPC and disk persistence.
export function panelHarness(file, props) {
  const values = [];
  let cursor = 0;
  let effects = [];
  let tree;
  const react = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in values))
        values[slot] = typeof initial === "function" ? initial() : initial;
      return [
        values[slot],
        (value) => {
          values[slot] =
            typeof value === "function" ? value(values[slot]) : value;
        },
      ];
    },
    useMemo(factory, deps) {
      const slot = cursor++;
      const cached = values[slot];
      if (
        !cached ||
        deps.length !== cached.deps.length ||
        deps.some((dep, i) => dep !== cached.deps[i])
      )
        values[slot] = { deps, value: factory() };
      return values[slot].value;
    },
    useRef(initial) {
      const slot = cursor++;
      return (values[slot] ||= { current: initial });
    },
    useCallback(callback, deps) {
      return react.useMemo(() => callback, deps);
    },
    useEffect(effect, deps) {
      const slot = cursor++;
      const previous = values[slot];
      if (
        !previous ||
        !deps ||
        deps.length !== previous.deps?.length ||
        deps.some((dep, i) => dep !== previous.deps?.[i])
      ) {
        effects.push(() => {
          previous?.cleanup?.();
          values[slot] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const runtime = {
    jsx: (type, props, key) => ({ type, props, key }),
    jsxs: (type, props, key) => ({ type, props, key }),
    Fragment: Symbol("Fragment"),
  };
  const loaded = new Map();
  function load(name) {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return runtime;
    if (name === "../personal-commands") return commands;
    if (name === "../record-usage") return usage;
    if (name === "../model") return model;
    if (name === "../personal-workspace") return personal;
    if (name === "../project-display") return projectDisplay;
    if (name === "./Controls") return { Action };
    const filename =
      name === "./usePersonalEditor"
        ? "usePersonalEditor.ts"
        : name === "./ReferenceHistory"
          ? "ReferenceHistory.tsx"
          : name === "./RecordPreview"
            ? "RecordPreview.tsx"
            : name;
    if (loaded.has(filename)) return loaded.get(filename);
    const module = { exports: {} };
    const source = readFileSync(
      new URL(
        filename.startsWith("../")
          ? `../../src/${filename.slice(3)}`
          : `../../src/components/${filename}`,
        import.meta.url,
      ),
      "utf8",
    );
    const output = transpileModule(source, {
      compilerOptions: {
        module: ModuleKind.CommonJS,
        target: ScriptTarget.ES2022,
        jsx: JsxEmit.ReactJSX,
      },
    }).outputText;
    new Function("require", "module", "exports", output)(
      load,
      module,
      module.exports,
    );
    loaded.set(filename, module.exports);
    return module.exports;
  }
  const Panel = load(file)[file.replace(/^\.\.\//, "").replace(/\.tsx?$/, "")];
  function render(next = props) {
    props = next;
    cursor = 0;
    effects = [];
    tree = Array.isArray(props) ? Panel(...props) : Panel(props);
    effects.forEach((effect) => effect());
    return tree;
  }
  function descendants(node) {
    if (Array.isArray(node)) return node.flatMap((child) => descendants(child));
    if (!node || typeof node !== "object") return [];
    return [node, ...descendants(node.props?.children)];
  }
  const nodes = () => descendants(tree);
  const text = (node) =>
    Array.isArray(node)
      ? node.map(text).join("")
      : node && typeof node === "object"
        ? text(node.props?.children)
        : String(node ?? "");
  function button(label) {
    const found = nodes().find(
      (node) =>
        (node.type === "button" || node.type === Action) &&
        text(node).trim() === label,
    );
    assert.ok(found, `找不到按钮：${label}`);
    return found;
  }
  render();
  return {
    render,
    nodes,
    text,
    button,
    get value() {
      return tree;
    },
    unmount() {
      values.forEach((slot) => slot?.cleanup?.());
      values.length = 0;
      tree = undefined;
    },
  };
}
