// @ts-nocheck
import * as __fd_glob_27 from "../content/docs/modules/tax-rates.mdx?collection=docs"
import * as __fd_glob_26 from "../content/docs/modules/reports.mdx?collection=docs"
import * as __fd_glob_25 from "../content/docs/modules/projects.mdx?collection=docs"
import * as __fd_glob_24 from "../content/docs/modules/payroll.mdx?collection=docs"
import * as __fd_glob_23 from "../content/docs/modules/journal-entries.mdx?collection=docs"
import * as __fd_glob_22 from "../content/docs/modules/invoicing.mdx?collection=docs"
import * as __fd_glob_21 from "../content/docs/modules/inventory.mdx?collection=docs"
import * as __fd_glob_20 from "../content/docs/modules/index.mdx?collection=docs"
import * as __fd_glob_19 from "../content/docs/modules/fixed-assets.mdx?collection=docs"
import * as __fd_glob_18 from "../content/docs/modules/expenses.mdx?collection=docs"
import * as __fd_glob_17 from "../content/docs/modules/contacts.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/modules/chart-of-accounts.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/modules/budgets.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/modules/bills.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/modules/banking.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/self-hosting/index.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/guides/multi-currency.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/guides/index.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/guides/api-integration.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/getting-started/index.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/api-reference/index.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/index.mdx?collection=docs"
import { default as __fd_glob_5 } from "../content/docs/modules/meta.json?collection=docs"
import { default as __fd_glob_4 } from "../content/docs/self-hosting/meta.json?collection=docs"
import { default as __fd_glob_3 } from "../content/docs/guides/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../content/docs/api-reference/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/getting-started/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "getting-started/meta.json": __fd_glob_1, "api-reference/meta.json": __fd_glob_2, "guides/meta.json": __fd_glob_3, "self-hosting/meta.json": __fd_glob_4, "modules/meta.json": __fd_glob_5, }, {"index.mdx": __fd_glob_6, "api-reference/index.mdx": __fd_glob_7, "getting-started/index.mdx": __fd_glob_8, "guides/api-integration.mdx": __fd_glob_9, "guides/index.mdx": __fd_glob_10, "guides/multi-currency.mdx": __fd_glob_11, "self-hosting/index.mdx": __fd_glob_12, "modules/banking.mdx": __fd_glob_13, "modules/bills.mdx": __fd_glob_14, "modules/budgets.mdx": __fd_glob_15, "modules/chart-of-accounts.mdx": __fd_glob_16, "modules/contacts.mdx": __fd_glob_17, "modules/expenses.mdx": __fd_glob_18, "modules/fixed-assets.mdx": __fd_glob_19, "modules/index.mdx": __fd_glob_20, "modules/inventory.mdx": __fd_glob_21, "modules/invoicing.mdx": __fd_glob_22, "modules/journal-entries.mdx": __fd_glob_23, "modules/payroll.mdx": __fd_glob_24, "modules/projects.mdx": __fd_glob_25, "modules/reports.mdx": __fd_glob_26, "modules/tax-rates.mdx": __fd_glob_27, });