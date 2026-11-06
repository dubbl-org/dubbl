import defaultComponents from "fumadocs-ui/mdx";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import type { MDXComponents } from "mdx/types";
import { icons } from "lucide-react";
import { Fold } from "@/components/docs/fold";
import { Shot } from "@/components/docs/shot";
import { Amount, Arrow, Box, Frame, JournalEntry, Label, Lifecycle, Pill, ShortVersion, TAccount } from "@/components/docs/diagrams/frame";
import * as diagrams from "@/components/docs/diagrams";

// Everything an MDX page can use without importing: Fumadocs' components, the
// screenshot and fold helpers, every docs diagram and lucide icon.
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    // Any lucide icon by name (`<Receipt />`), for card icons. Listed first so the
    // components below win when a name is shared.
    ...icons,
    ...defaultComponents,
    Step,
    Steps,
    Tab,
    Tabs,
    Accordion,
    Accordions,
    Fold,
    Shot,
    Frame,
    Pill,
    Label,
    Arrow,
    Box,
    ShortVersion,
    Amount,
    JournalEntry,
    TAccount,
    Lifecycle,
    ...diagrams,
    ...components,
  };
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return getMDXComponents(components);
}
