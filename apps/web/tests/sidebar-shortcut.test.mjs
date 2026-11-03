import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const webRoot = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
const tooling = createRequire(require.resolve("@tailwindcss/turbopack"));
const { Scanner } = tooling("@tailwindcss/oxide");
const { __unstable__loadDesignSystem: loadDesignSystem } = tooling("@tailwindcss/node");

function readSource(file) {
  return ts.createSourceFile(
    file,
    readFileSync(new URL(file, webRoot), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function detectedClasses(source) {
  return new Set(new Scanner({ sources: [] }).scanFiles([
    { content: source.text, extension: "tsx" },
  ]));
}

test("Cmd+B collapses the sidebar width and Ctrl+B reopens it", async () => {
  const source = readSource("features/workspace/dashboard-shell.tsx");
  let handler;
  let classes;
  visit(source, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "toggleSidebar") {
      handler = node.getText(source);
    }
    if (!ts.isJsxOpeningElement(node)) return;
    const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
    if (!attributes.some((attribute) =>
      attribute.name.getText(source) === "data-ui" &&
      attribute.initializer?.text === "dashboard-shell"
    )) return;
    const attribute = attributes.find((entry) => entry.name.getText(source) === "className");
    const value = ts.isJsxExpression(attribute.initializer)
      ? attribute.initializer.expression
      : attribute.initializer;
    classes = value.text.split(/\s+/);
  });
  assert.ok(handler, "Dashboard keyboard handler must exist");
  assert.ok(classes, "Dashboard layout utilities must exist");

  let collapsed = false;
  class Element {
    closest() { return null; }
  }
  const context = vm.createContext({
    Element,
    window: { matchMedia: () => ({ matches: false }) },
    document: { querySelector: () => null },
    setCollapsed: (update) => { collapsed = update(collapsed); },
    setMobileOpen: () => assert.fail("Desktop shortcut must use the desktop sidebar"),
  });
  vm.runInContext(ts.transpile(handler), context);

  const theme = await loadDesignSystem(
    readFileSync(new URL("app/globals.css", webRoot), "utf8"),
    { base: fileURLToPath(webRoot) },
  );
  const detected = detectedClasses(source);
  const rules = theme.candidatesToCss(classes.filter((name) =>
    name.includes("--sidebar-width:") && detected.has(name)
  ));
  function sidebarWidth() {
    let width;
    for (const rule of rules) {
      const state = rule.match(/\[data-collapsed=([^\]]+)\]/);
      if (state && state[1].replace(/^['"]|['"]$/g, "") !== String(collapsed)) continue;
      width = rule.match(/--sidebar-width:\s*([^;]+);/)[1];
    }
    return width;
  }
  function press(modifier) {
    let prevented = false;
    context.toggleSidebar({
      key: "b",
      defaultPrevented: false,
      repeat: false,
      isComposing: false,
      metaKey: modifier === "meta",
      ctrlKey: modifier === "ctrl",
      altKey: false,
      shiftKey: false,
      target: new Element(),
      preventDefault: () => { prevented = true; },
    });
    assert.ok(prevented, "Sidebar shortcut must prevent the browser default");
  }

  assert.equal(sidebarWidth(), "224px");
  press("meta");
  assert.equal(collapsed, true);
  assert.equal(sidebarWidth(), "68px");
  press("ctrl");
  assert.equal(collapsed, false);
  assert.equal(sidebarWidth(), "224px");
});

test("Tailwind detects the runtime collapsed styles for navigation and branding", () => {
  for (const file of [
    "features/workspace/dashboard-shell.tsx",
    "features/workspace/sidebar-navigation.tsx",
    "components/brand.tsx",
  ]) {
    const source = readSource(file);
    const detected = detectedClasses(source);
    let checked = 0;
    visit(source, (node) => {
      if (!ts.isStringLiteralLike(node)) return;
      for (const name of node.text.split(/\s+/).filter((value) => value.includes("collapsed="))) {
        assert.ok(detected.has(name), `${file}: Tailwind must detect ${name}`);
        checked++;
      }
    });
    assert.ok(checked > 0, `${file}: collapsed-state utilities must exist`);
  }
});
