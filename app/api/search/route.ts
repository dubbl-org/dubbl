import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

// Docs search (the ⌘K dialog on /docs).
export const { GET } = createFromSource(source, { language: "english" });
