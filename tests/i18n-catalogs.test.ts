import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

type CatalogValue = string | { [key: string]: CatalogValue };
type Catalog = Record<string, CatalogValue>;

const messagesDir = fileURLToPath(new URL("../messages/", import.meta.url));

function loadCatalog(locale: string): Catalog {
  const filePath = path.join(messagesDir, `${locale}.json`);
  return JSON.parse(readFileSync(filePath, "utf8")) as Catalog;
}

function leafValues(value: CatalogValue, prefix = ""): Map<string, string> {
  const leaves = new Map<string, string>();

  for (const [key, child] of Object.entries(value)) {
    const messageKey = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") {
      leaves.set(messageKey, child);
    } else {
      for (const [nestedKey, message] of leafValues(child, messageKey)) {
        leaves.set(nestedKey, message);
      }
    }
  }

  return leaves;
}

function hasNonEmptyMessage(catalogs: Catalog[], key: string): boolean {
  return catalogs.some((catalog) => {
    const value = leafValues(catalog).get(key);
    return value !== undefined && value.trim().length > 0;
  });
}

function placeholders(message: string): string[] {
  return [...new Set([...message.matchAll(/\{\s*([A-Za-z0-9_]+)\s*(?:,|\})/g)].map((match) => match[1]))].sort();
}

test("every locale provides all English message keys through its fallback chain", () => {
  const catalogFiles = readdirSync(messagesDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const locales = catalogFiles.map((file) => file.slice(0, -".json".length));
  const english = loadCatalog("en");
  const englishKeys = [...leafValues(english).keys()].sort();

  assert.ok(locales.includes("en"), "messages/en.json must exist as the fallback catalog");

  const failures: string[] = [];
  for (const locale of locales) {
    if (locale === "en") continue;

    const regionalCatalog = loadCatalog(locale);
    const baseLanguage = locale.split("-")[0];
    const fallbackCatalogs = [
      ...(baseLanguage !== locale && locales.includes(baseLanguage)
        ? [loadCatalog(baseLanguage)]
        : []),
      regionalCatalog,
    ];

    const missingKeys = englishKeys.filter(
      (key) => !hasNonEmptyMessage(fallbackCatalogs, key)
    );

    if (missingKeys.length > 0) {
      failures.push(`${locale}:\n  ${missingKeys.join("\n  ")}`);
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Missing translations (regional catalogs may inherit from their base language):\n${failures.join("\n")}`
  );
});

test("translations preserve the placeholders used by English messages", () => {
  const catalogFiles = readdirSync(messagesDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const locales = catalogFiles.map((file) => file.slice(0, -".json".length));
  const english = leafValues(loadCatalog("en"));
  const failures: string[] = [];

  for (const locale of locales) {
    if (locale === "en") continue;
    const baseLanguage = locale.split("-")[0];
    const resolved = new Map<string, string>();
    if (baseLanguage !== locale && locales.includes(baseLanguage)) {
      for (const [key, value] of leafValues(loadCatalog(baseLanguage))) resolved.set(key, value);
    }
    for (const [key, value] of leafValues(loadCatalog(locale))) resolved.set(key, value);

    for (const [key, sourceMessage] of english) {
      const translatedMessage = resolved.get(key);
      if (!translatedMessage) continue;
      const sourcePlaceholders = placeholders(sourceMessage);
      const translatedPlaceholders = placeholders(translatedMessage);
      if (sourcePlaceholders.join(",") !== translatedPlaceholders.join(",")) {
        failures.push(
          `${locale}.${key}: expected {${sourcePlaceholders.join(", ")}}, got {${translatedPlaceholders.join(", ")}}`
        );
      }
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Message placeholders must match English so interpolated data renders in every locale:\n${failures.join("\n")}`
  );
});
