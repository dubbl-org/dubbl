import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { test } from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

// Expand this list as feature areas are fully moved to message catalogs.
const localizedSources = [
  "app/(dashboard)/settings/layout.tsx",
  "app/(dashboard)/settings/members/page.tsx",
  "app/(dashboard)/settings/api-keys/page.tsx",
  "app/(dashboard)/settings/page.tsx",
  "app/(dashboard)/settings/notifications/page.tsx",
  "app/(dashboard)/settings/roles/page.tsx",
  "app/(dashboard)/settings/tags/page.tsx",
];

function visibleLiteralStrings(sourcePath: string): string[] {
  const filePath = path.join(projectRoot, sourcePath);
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const literals: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      const text = node.text.trim().replace(/\s+/g, " ");
      const parentTag = ts.isJsxElement(node.parent)
        ? node.parent.openingElement.tagName.getText(sourceFile)
        : "";
      if (parentTag !== "code" && /[\p{L}]/u.test(text)) literals.push(text);
    }

    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      if (["alt", "placeholder", "title", "aria-label", "aria-description"].includes(node.name.getText(sourceFile))) {
        const text = node.initializer.text.trim();
        if (/[\p{L}]/u.test(text)) literals.push(`${node.name.getText(sourceFile)}=${text}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return literals;
}

function missingMessageKeys(sourcePath: string): string[] {
  const filePath = path.join(projectRoot, sourcePath);
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const english = JSON.parse(readFileSync(path.join(projectRoot, "messages/en.json"), "utf8")) as Record<string, unknown>;
  let namespace = "";
  let translator = "t";
  const usedKeys = new Set<string>();

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
      const call = node.initializer;
      if (ts.isIdentifier(call.expression) && call.expression.text === "useTranslations" && call.arguments[0] && ts.isStringLiteral(call.arguments[0])) {
        translator = node.name.text;
        namespace = call.arguments[0].text;
      }
    }

    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const isTranslatorCall = ts.isIdentifier(expression)
        ? expression.text === translator
        : ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === translator;
      if (isTranslatorCall && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        usedKeys.add(`${namespace}.${node.arguments[0].text}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...usedKeys].filter((key) => {
    let value: unknown = english;
    for (const part of key.split(".")) {
      if (!value || typeof value !== "object" || !(part in value)) return true;
      value = (value as Record<string, unknown>)[part];
    }
    return typeof value !== "string";
  });
}

test("localized settings sources keep visible copy in message catalogs", () => {
  const failures = localizedSources.flatMap((source) => {
    const literals = visibleLiteralStrings(source);
    const missingKeys = missingMessageKeys(source);
    const issues = [
      ...(literals.length > 0 ? [`Untranslated visible strings:\n  ${literals.join("\n  ")}`] : []),
      ...(missingKeys.length > 0 ? [`Missing English catalog keys:\n  ${missingKeys.join("\n  ")}`] : []),
    ];
    return issues.length > 0 ? [`${source}:\n${issues.join("\n")}`] : [];
  });

  assert.deepEqual(
    failures,
    [],
    `Move newly added visible copy in these localized settings sources to messages/*.json:\n${failures.join("\n")}`
  );
});
