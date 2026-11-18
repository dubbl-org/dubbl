/**
 * Zip assembly, and the one entry point that turns `XbrlInput` into a filing.
 *
 * BizFinx takes a zip containing the instance, the company extension with its
 * linkbases, and the ACRA taxonomy those documents reference. The taxonomy is
 * read from the committed asset (`assets/xbrl/acra-2026`) so what is filed is
 * exactly what was reviewed, and only the parts the documents reference are
 * included — ACRA's own validation formulas stay out of the upload.
 *
 * No zip dependency: the format needed here is stored-or-deflate with no
 * encryption, which `node:zlib` covers in one function.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { XbrlFile, XbrlInput, XbrlPackage } from "./types";
import { buildFacts } from "./facts";
import { buildExtension } from "./extension";
import { buildInstanceXml } from "./instance";
import { validate } from "./validate";
import { TEMPLATES } from "./taxonomy.generated";

const TAXONOMY_ROOT = join(process.cwd(), "assets/xbrl/acra-2026");

export function packageFileName(input: XbrlInput): string {
  return `${input.company.uen}-${input.period.endDate}`;
}

/**
 * The taxonomy files the emitted documents reference: one framework, the element
 * schemas (which point at `references/` and `labels/`), and those directories.
 * `formula/` — ACRA's own validation rules — is deliberately absent.
 */
export function taxonomyFiles(template: XbrlInput["template"], taxonomyDir = "Taxonomy2026"): XbrlFile[] {
  const framework = TEMPLATES[template].framework;
  const dirs = [framework, "elts", "labels", "references"];
  const files: XbrlFile[] = [];
  const walk = (relative: string) => {
    for (const name of readdirSync(join(TAXONOMY_ROOT, relative))) {
      const path = `${relative}/${name}`;
      if (statSync(join(TAXONOMY_ROOT, path)).isDirectory()) walk(path);
      else files.push({ name: `${taxonomyDir}/${path}`, content: readFileSync(join(TAXONOMY_ROOT, path), "utf8") });
    }
  };
  dirs.forEach(walk);
  return files;
}

/** Build the whole filing: facts, documents, validation report and zip inputs. */
export function buildXbrlPackage(input: XbrlInput): XbrlPackage {
  const fileName = packageFileName(input);
  const { facts, scalars, issues: mappingIssues } = buildFacts(input);
  const extension = buildExtension({ fileName, template: input.template, input, facts });
  const instanceXml = buildInstanceXml({ fileName, input, facts });
  const issues = validate({
    input,
    template: input.template,
    facts,
    scalars,
    issues: mappingIssues,
    imports: extension.imports,
  });

  const files: XbrlFile[] = [
    { name: `${fileName}.xbrl`, content: instanceXml },
    { name: `${fileName}.xsd`, content: extension.xsd },
    { name: `${fileName}_pre.xml`, content: extension.presentationXml },
    { name: `${fileName}_cal.xml`, content: extension.calculationXml },
    { name: `${fileName}_def.xml`, content: extension.definitionXml },
    ...taxonomyFiles(input.template),
  ];

  return {
    fileName,
    taxonomyDir: "Taxonomy2026",
    instanceXml,
    extensionXsd: extension.xsd,
    presentationXml: extension.presentationXml,
    calculationXml: extension.calculationXml,
    definitionXml: extension.definitionXml,
    files,
    issues,
  };
}

// ---- zip ------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Fixed timestamp: the same filing always zips to the same bytes. */
const DOS_TIME = 0;
const DOS_DATE = 0x0021; // 1980-01-01

export function zipBuffer(files: readonly XbrlFile[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.content, "utf8");
    const compressed = deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuffer, end]);
}

/** Read a zip back: the golden test asserts on what the validator would see. */
export function unzip(buffer: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("not a zip: no end-of-central-directory record");
  const count = buffer.readUInt16LE(eocd + 10);
  let position = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(position) !== 0x02014b50) throw new Error("corrupt central directory");
    const method = buffer.readUInt16LE(position + 10);
    const compressedSize = buffer.readUInt32LE(position + 20);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLength = buffer.readUInt16LE(position + 32);
    const localOffset = buffer.readUInt32LE(position + 42);
    const name = buffer.toString("utf8", position + 46, position + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    out.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8"));
    position += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}
