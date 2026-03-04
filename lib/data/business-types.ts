// Country-to-business-entity-type mapping for global bookkeeping support.
// Each country lists the legal entity types available in that jurisdiction.

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  flag: string;
  defaultCurrency: string;
}

export interface BusinessType {
  code: string;
  localName: string;
  englishName: string;
}

export const COUNTRIES: Country[] = [
  // North America
  { code: "US", name: "United States", flag: "\u{1F1FA}\u{1F1F8}", defaultCurrency: "USD" },
  { code: "CA", name: "Canada", flag: "\u{1F1E8}\u{1F1E6}", defaultCurrency: "CAD" },
  { code: "MX", name: "Mexico", flag: "\u{1F1F2}\u{1F1FD}", defaultCurrency: "MXN" },

  // Europe
  { code: "GB", name: "United Kingdom", flag: "\u{1F1EC}\u{1F1E7}", defaultCurrency: "GBP" },
  { code: "DE", name: "Germany", flag: "\u{1F1E9}\u{1F1EA}", defaultCurrency: "EUR" },
  { code: "FR", name: "France", flag: "\u{1F1EB}\u{1F1F7}", defaultCurrency: "EUR" },
  { code: "NL", name: "Netherlands", flag: "\u{1F1F3}\u{1F1F1}", defaultCurrency: "EUR" },
  { code: "ES", name: "Spain", flag: "\u{1F1EA}\u{1F1F8}", defaultCurrency: "EUR" },
  { code: "IT", name: "Italy", flag: "\u{1F1EE}\u{1F1F9}", defaultCurrency: "EUR" },
  { code: "SE", name: "Sweden", flag: "\u{1F1F8}\u{1F1EA}", defaultCurrency: "SEK" },
  { code: "DK", name: "Denmark", flag: "\u{1F1E9}\u{1F1F0}", defaultCurrency: "DKK" },
  { code: "NO", name: "Norway", flag: "\u{1F1F3}\u{1F1F4}", defaultCurrency: "NOK" },
  { code: "FI", name: "Finland", flag: "\u{1F1EB}\u{1F1EE}", defaultCurrency: "EUR" },
  { code: "BE", name: "Belgium", flag: "\u{1F1E7}\u{1F1EA}", defaultCurrency: "EUR" },
  { code: "PT", name: "Portugal", flag: "\u{1F1F5}\u{1F1F9}", defaultCurrency: "EUR" },
  { code: "PL", name: "Poland", flag: "\u{1F1F5}\u{1F1F1}", defaultCurrency: "PLN" },
  { code: "CZ", name: "Czech Republic", flag: "\u{1F1E8}\u{1F1FF}", defaultCurrency: "CZK" },
  { code: "CH", name: "Switzerland", flag: "\u{1F1E8}\u{1F1ED}", defaultCurrency: "CHF" },
  { code: "AT", name: "Austria", flag: "\u{1F1E6}\u{1F1F9}", defaultCurrency: "EUR" },
  { code: "IE", name: "Ireland", flag: "\u{1F1EE}\u{1F1EA}", defaultCurrency: "EUR" },

  // Asia-Pacific
  { code: "AU", name: "Australia", flag: "\u{1F1E6}\u{1F1FA}", defaultCurrency: "AUD" },
  { code: "NZ", name: "New Zealand", flag: "\u{1F1F3}\u{1F1FF}", defaultCurrency: "NZD" },
  { code: "JP", name: "Japan", flag: "\u{1F1EF}\u{1F1F5}", defaultCurrency: "JPY" },
  { code: "IN", name: "India", flag: "\u{1F1EE}\u{1F1F3}", defaultCurrency: "INR" },
  { code: "SG", name: "Singapore", flag: "\u{1F1F8}\u{1F1EC}", defaultCurrency: "SGD" },
  { code: "HK", name: "Hong Kong", flag: "\u{1F1ED}\u{1F1F0}", defaultCurrency: "HKD" },
  { code: "KR", name: "South Korea", flag: "\u{1F1F0}\u{1F1F7}", defaultCurrency: "KRW" },
  { code: "CN", name: "China", flag: "\u{1F1E8}\u{1F1F3}", defaultCurrency: "CNY" },
  { code: "TH", name: "Thailand", flag: "\u{1F1F9}\u{1F1ED}", defaultCurrency: "THB" },
  { code: "ID", name: "Indonesia", flag: "\u{1F1EE}\u{1F1E9}", defaultCurrency: "IDR" },
  { code: "PH", name: "Philippines", flag: "\u{1F1F5}\u{1F1ED}", defaultCurrency: "PHP" },
  { code: "VN", name: "Vietnam", flag: "\u{1F1FB}\u{1F1F3}", defaultCurrency: "VND" },
  { code: "TW", name: "Taiwan", flag: "\u{1F1F9}\u{1F1FC}", defaultCurrency: "TWD" },

  // South America
  { code: "BR", name: "Brazil", flag: "\u{1F1E7}\u{1F1F7}", defaultCurrency: "BRL" },

  // Middle East
  { code: "AE", name: "United Arab Emirates", flag: "\u{1F1E6}\u{1F1EA}", defaultCurrency: "AED" },
  { code: "SA", name: "Saudi Arabia", flag: "\u{1F1F8}\u{1F1E6}", defaultCurrency: "SAR" },
  { code: "IL", name: "Israel", flag: "\u{1F1EE}\u{1F1F1}", defaultCurrency: "ILS" },

  // Africa
  { code: "ZA", name: "South Africa", flag: "\u{1F1FF}\u{1F1E6}", defaultCurrency: "ZAR" },
  { code: "NG", name: "Nigeria", flag: "\u{1F1F3}\u{1F1EC}", defaultCurrency: "NGN" },
  { code: "KE", name: "Kenya", flag: "\u{1F1F0}\u{1F1EA}", defaultCurrency: "KES" },
];

export const BUSINESS_TYPES: Record<string, BusinessType[]> = {
  // ── United States ──
  US: [
    { code: "SOLE_PROPRIETORSHIP", localName: "Sole Proprietorship", englishName: "Sole Proprietorship" },
    { code: "LLC", localName: "Limited Liability Company", englishName: "LLC" },
    { code: "C_CORP", localName: "C Corporation", englishName: "C Corporation" },
    { code: "S_CORP", localName: "S Corporation", englishName: "S Corporation" },
    { code: "PARTNERSHIP", localName: "General Partnership", englishName: "General Partnership" },
    { code: "LP", localName: "Limited Partnership", englishName: "Limited Partnership" },
    { code: "LLP", localName: "Limited Liability Partnership", englishName: "LLP" },
    { code: "PC", localName: "Professional Corporation", englishName: "Professional Corporation" },
    { code: "PLLC", localName: "Professional LLC", englishName: "Professional LLC" },
    { code: "B_CORP", localName: "Benefit Corporation", englishName: "Benefit Corporation" },
    { code: "NONPROFIT", localName: "Non-Profit Corporation", englishName: "Non-Profit" },
    { code: "COOPERATIVE", localName: "Cooperative", englishName: "Cooperative" },
  ],

  // ── United Kingdom ──
  GB: [
    { code: "SOLE_TRADER", localName: "Sole Trader", englishName: "Sole Trader" },
    { code: "LTD", localName: "Private Company Limited by Shares", englishName: "Ltd" },
    { code: "LTD_GUARANTEE", localName: "Private Company Limited by Guarantee", englishName: "Ltd by Guarantee" },
    { code: "PLC", localName: "Public Limited Company", englishName: "PLC" },
    { code: "LLP", localName: "Limited Liability Partnership", englishName: "LLP" },
    { code: "LP", localName: "Limited Partnership", englishName: "LP" },
    { code: "PARTNERSHIP", localName: "General Partnership", englishName: "General Partnership" },
    { code: "CIC", localName: "Community Interest Company", englishName: "CIC" },
    { code: "CIO", localName: "Charitable Incorporated Organisation", englishName: "CIO" },
    { code: "COOPERATIVE", localName: "Co-operative Society", englishName: "Cooperative" },
    { code: "CHARITY", localName: "Charity", englishName: "Charity" },
  ],

  // ── Canada ──
  CA: [
    { code: "SOLE_PROPRIETORSHIP", localName: "Sole Proprietorship", englishName: "Sole Proprietorship" },
    { code: "PARTNERSHIP", localName: "General Partnership", englishName: "General Partnership" },
    { code: "LP", localName: "Limited Partnership", englishName: "Limited Partnership" },
    { code: "LLP", localName: "Limited Liability Partnership", englishName: "LLP" },
    { code: "CORPORATION", localName: "Corporation", englishName: "Corporation" },
    { code: "ULC", localName: "Unlimited Liability Corporation", englishName: "ULC" },
    { code: "COOPERATIVE", localName: "Cooperative", englishName: "Cooperative" },
    { code: "NONPROFIT", localName: "Non-Profit Corporation", englishName: "Non-Profit" },
  ],

  // ── Australia ──
  AU: [
    { code: "SOLE_TRADER", localName: "Sole Trader", englishName: "Sole Trader" },
    { code: "PTY_LTD", localName: "Proprietary Limited Company", englishName: "Pty Ltd" },
    { code: "LTD", localName: "Public Company", englishName: "Ltd" },
    { code: "PARTNERSHIP", localName: "General Partnership", englishName: "Partnership" },
    { code: "LP", localName: "Limited Partnership", englishName: "Limited Partnership" },
    { code: "TRUST", localName: "Trust", englishName: "Trust" },
    { code: "COOPERATIVE", localName: "Co-operative", englishName: "Cooperative" },
    { code: "INCORPORATED_ASSOCIATION", localName: "Incorporated Association", englishName: "Incorporated Association" },
  ],

  // ── Germany ──
  DE: [
    { code: "EINZELUNTERNEHMEN", localName: "Einzelunternehmen", englishName: "Sole Proprietorship" },
    { code: "GBR", localName: "Gesellschaft b\u00fcrgerlichen Rechts (GbR)", englishName: "Civil Law Partnership" },
    { code: "OHG", localName: "Offene Handelsgesellschaft (OHG)", englishName: "General Partnership" },
    { code: "KG", localName: "Kommanditgesellschaft (KG)", englishName: "Limited Partnership" },
    { code: "GMBH", localName: "Gesellschaft mit beschr\u00e4nkter Haftung (GmbH)", englishName: "Limited Liability Company" },
    { code: "UG", localName: "Unternehmergesellschaft (UG)", englishName: "Entrepreneurial Company" },
    { code: "AG", localName: "Aktiengesellschaft (AG)", englishName: "Stock Corporation" },
    { code: "GMBH_CO_KG", localName: "GmbH & Co. KG", englishName: "Ltd Partnership with GmbH as GP" },
    { code: "PARTG", localName: "Partnerschaftsgesellschaft (PartG)", englishName: "Professional Partnership" },
    { code: "GGMBH", localName: "Gemeinn\u00fctzige GmbH (gGmbH)", englishName: "Non-Profit LLC" },
    { code: "EG", localName: "Eingetragene Genossenschaft (eG)", englishName: "Registered Cooperative" },
    { code: "SE", localName: "Societas Europaea (SE)", englishName: "European Company" },
  ],

  // ── France ──
  FR: [
    { code: "AUTO_ENTREPRENEUR", localName: "Auto-Entrepreneur / Micro-Entreprise", englishName: "Micro-Enterprise" },
    { code: "EI", localName: "Entreprise Individuelle (EI)", englishName: "Sole Proprietorship" },
    { code: "EURL", localName: "Entreprise Unipersonnelle \u00e0 Responsabilit\u00e9 Limit\u00e9e (EURL)", englishName: "Single-Member LLC" },
    { code: "SARL", localName: "Soci\u00e9t\u00e9 \u00e0 Responsabilit\u00e9 Limit\u00e9e (SARL)", englishName: "Limited Liability Company" },
    { code: "SASU", localName: "Soci\u00e9t\u00e9 par Actions Simplifi\u00e9e Unipersonnelle (SASU)", englishName: "Single-Shareholder SAS" },
    { code: "SAS", localName: "Soci\u00e9t\u00e9 par Actions Simplifi\u00e9e (SAS)", englishName: "Simplified Joint-Stock Company" },
    { code: "SA", localName: "Soci\u00e9t\u00e9 Anonyme (SA)", englishName: "Public Limited Company" },
    { code: "SNC", localName: "Soci\u00e9t\u00e9 en Nom Collectif (SNC)", englishName: "General Partnership" },
    { code: "SCI", localName: "Soci\u00e9t\u00e9 Civile Immobili\u00e8re (SCI)", englishName: "Real Estate Company" },
    { code: "SCOP", localName: "Soci\u00e9t\u00e9 Coop\u00e9rative et Participative (SCOP)", englishName: "Worker Cooperative" },
    { code: "SCP", localName: "Soci\u00e9t\u00e9 Civile Professionnelle (SCP)", englishName: "Professional Partnership" },
  ],

  // ── Netherlands ──
  NL: [
    { code: "EENMANSZAAK", localName: "Eenmanszaak", englishName: "Sole Proprietorship" },
    { code: "VOF", localName: "Vennootschap onder Firma (VOF)", englishName: "General Partnership" },
    { code: "MAATSCHAP", localName: "Maatschap", englishName: "Professional Partnership" },
    { code: "CV", localName: "Commanditaire Vennootschap (CV)", englishName: "Limited Partnership" },
    { code: "BV", localName: "Besloten Vennootschap (BV)", englishName: "Private Limited Company" },
    { code: "NV", localName: "Naamloze Vennootschap (NV)", englishName: "Public Limited Company" },
    { code: "COOPERATIE", localName: "Co\u00f6peratie", englishName: "Cooperative" },
    { code: "STICHTING", localName: "Stichting", englishName: "Foundation" },
    { code: "VERENIGING", localName: "Vereniging", englishName: "Association" },
  ],

  // ── India ──
  IN: [
    { code: "SOLE_PROPRIETORSHIP", localName: "Sole Proprietorship", englishName: "Sole Proprietorship" },
    { code: "HUF", localName: "Hindu Undivided Family", englishName: "HUF" },
    { code: "PARTNERSHIP", localName: "Partnership Firm", englishName: "Partnership" },
    { code: "LLP", localName: "Limited Liability Partnership", englishName: "LLP" },
    { code: "OPC", localName: "One Person Company", englishName: "One Person Company" },
    { code: "PVT_LTD", localName: "Private Limited Company", englishName: "Pvt Ltd" },
    { code: "LTD", localName: "Public Limited Company", englishName: "Public Limited" },
    { code: "SECTION_8", localName: "Section 8 Company", englishName: "Non-Profit Company" },
    { code: "COOPERATIVE", localName: "Cooperative Society", englishName: "Cooperative" },
    { code: "TRUST", localName: "Trust", englishName: "Trust" },
  ],

  // ── Japan ──
  JP: [
    { code: "SOLE_PROPRIETORSHIP", localName: "\u500B\u4EBA\u4E8B\u696D (Kojin Jigyo)", englishName: "Sole Proprietorship" },
    { code: "KK", localName: "\u682A\u5F0F\u4F1A\u793E (Kabushiki Kaisha)", englishName: "Stock Corporation" },
    { code: "GK", localName: "\u5408\u540C\u4F1A\u793E (Godo Kaisha)", englishName: "Limited Liability Company" },
    { code: "GOMEI", localName: "\u5408\u540D\u4F1A\u793E (Gomei Kaisha)", englishName: "General Partnership" },
    { code: "GOSHI", localName: "\u5408\u8CC7\u4F1A\u793E (Goshi Kaisha)", englishName: "Limited Partnership" },
    { code: "COOPERATIVE", localName: "Cooperative", englishName: "Cooperative" },
  ],

  // ── Brazil ──
  BR: [
    { code: "MEI", localName: "Microempreendedor Individual (MEI)", englishName: "Individual Micro-Entrepreneur" },
    { code: "EI", localName: "Empres\u00e1rio Individual (EI)", englishName: "Individual Entrepreneur" },
    { code: "SLU", localName: "Sociedade Limitada Unipessoal (SLU)", englishName: "Single-Member LLC" },
    { code: "LTDA", localName: "Sociedade Limitada (Ltda)", englishName: "Limited Liability Company" },
    { code: "SA", localName: "Sociedade An\u00f4nima (SA)", englishName: "Corporation" },
    { code: "SOCIEDADE_SIMPLES", localName: "Sociedade Simples", englishName: "Simple Company" },
    { code: "COOPERATIVE", localName: "Cooperativa", englishName: "Cooperative" },
  ],

  // ── Spain ──
  ES: [
    { code: "AUTONOMO", localName: "Aut\u00f3nomo / Empresario Individual", englishName: "Sole Trader" },
    { code: "SL", localName: "Sociedad Limitada (SL / SRL)", englishName: "Limited Liability Company" },
    { code: "SLNE", localName: "Sociedad Limitada Nueva Empresa (SLNE)", englishName: "New Enterprise LLC" },
    { code: "SA", localName: "Sociedad An\u00f3nima (SA)", englishName: "Public Limited Company" },
    { code: "SC", localName: "Sociedad Cooperativa", englishName: "Cooperative" },
    { code: "CB", localName: "Comunidad de Bienes (CB)", englishName: "Joint Ownership" },
    { code: "SOCIEDAD_CIVIL", localName: "Sociedad Civil", englishName: "Civil Partnership" },
    { code: "SOCIEDAD_COLECTIVA", localName: "Sociedad Colectiva", englishName: "General Partnership" },
    { code: "SOCIEDAD_LABORAL", localName: "Sociedad Laboral", englishName: "Worker-Owned Company" },
  ],

  // ── Italy ──
  IT: [
    { code: "DITTA_INDIVIDUALE", localName: "Ditta Individuale", englishName: "Sole Proprietorship" },
    { code: "SRL", localName: "Societ\u00e0 a Responsabilit\u00e0 Limitata (SRL)", englishName: "Limited Liability Company" },
    { code: "SRLS", localName: "SRL Semplificata (SRLS)", englishName: "Simplified LLC" },
    { code: "SPA", localName: "Societ\u00e0 per Azioni (SpA)", englishName: "Joint-Stock Company" },
    { code: "SNC", localName: "Societ\u00e0 in Nome Collettivo (SNC)", englishName: "General Partnership" },
    { code: "SAS", localName: "Societ\u00e0 in Accomandita Semplice (SAS)", englishName: "Limited Partnership" },
    { code: "COOPERATIVA", localName: "Societ\u00e0 Cooperativa", englishName: "Cooperative" },
  ],

  // ── Sweden ──
  SE: [
    { code: "EF", localName: "Enskild Firma", englishName: "Sole Proprietorship" },
    { code: "AB", localName: "Aktiebolag (AB)", englishName: "Limited Company" },
    { code: "HB", localName: "Handelsbolag (HB)", englishName: "General Partnership" },
    { code: "KB", localName: "Kommanditbolag (KB)", englishName: "Limited Partnership" },
    { code: "EKONOMISK_FORENING", localName: "Ekonomisk F\u00f6rening", englishName: "Economic Association / Cooperative" },
  ],

  // ── Denmark ──
  DK: [
    { code: "ENKELTMANDSVIRKSOMHED", localName: "Enkeltmandsvirksomhed", englishName: "Sole Proprietorship" },
    { code: "APS", localName: "Anpartsselskab (ApS)", englishName: "Private Limited Company" },
    { code: "AS", localName: "Aktieselskab (A/S)", englishName: "Public Limited Company" },
    { code: "IS", localName: "Interessentskab (I/S)", englishName: "General Partnership" },
    { code: "KS", localName: "Kommanditselskab (K/S)", englishName: "Limited Partnership" },
    { code: "AMBA", localName: "Andelsselskab (AMBA)", englishName: "Cooperative" },
  ],

  // ── Norway ──
  NO: [
    { code: "ENKELTPERSONFORETAK", localName: "Enkeltpersonforetak", englishName: "Sole Proprietorship" },
    { code: "AS", localName: "Aksjeselskap (AS)", englishName: "Private Limited Company" },
    { code: "ASA", localName: "Allmennaksjeselskap (ASA)", englishName: "Public Limited Company" },
    { code: "ANS", localName: "Ansvarlig Selskap (ANS)", englishName: "General Partnership" },
    { code: "DA", localName: "Delt Ansvar (DA)", englishName: "Partnership with Divided Liability" },
    { code: "KS", localName: "Kommandittselskap (KS)", englishName: "Limited Partnership" },
  ],

  // ── Finland ──
  FI: [
    { code: "TOIMINIMI", localName: "Toiminimi", englishName: "Sole Proprietorship" },
    { code: "OY", localName: "Osakeyhti\u00f6 (Oy)", englishName: "Private Limited Company" },
    { code: "OYJ", localName: "Julkinen Osakeyhti\u00f6 (Oyj)", englishName: "Public Limited Company" },
    { code: "AY", localName: "Avoin Yhti\u00f6 (Ay)", englishName: "General Partnership" },
    { code: "KY", localName: "Kommandiittiyht\u00f6 (Ky)", englishName: "Limited Partnership" },
    { code: "OSUUSKUNTA", localName: "Osuuskunta", englishName: "Cooperative" },
  ],

  // ── Belgium ──
  BE: [
    { code: "ENTREPRISE_INDIVIDUELLE", localName: "Entreprise Individuelle / Eenmanszaak", englishName: "Sole Proprietorship" },
    { code: "SRL_BV", localName: "SRL / BV", englishName: "Private Limited Company" },
    { code: "SA_NV", localName: "SA / NV", englishName: "Public Limited Company" },
    { code: "SNC_VOF", localName: "SNC / VOF", englishName: "General Partnership" },
    { code: "SC", localName: "SC", englishName: "Cooperative" },
    { code: "ASBL_VZW", localName: "ASBL / VZW", englishName: "Non-Profit Association" },
  ],

  // ── Portugal ──
  PT: [
    { code: "EMPRESARIO_INDIVIDUAL", localName: "Empres\u00e1rio em Nome Individual", englishName: "Sole Proprietorship" },
    { code: "LDA", localName: "Sociedade por Quotas (Lda.)", englishName: "Limited Liability Company" },
    { code: "UNIPESSOAL_LDA", localName: "Sociedade Unipessoal por Quotas", englishName: "Single-Member LLC" },
    { code: "SA", localName: "Sociedade An\u00f3nima (SA)", englishName: "Public Limited Company" },
    { code: "COOPERATIVA", localName: "Cooperativa", englishName: "Cooperative" },
  ],

  // ── Poland ──
  PL: [
    { code: "JDG", localName: "Jednoosobowa Dzia\u0142alno\u015b\u0107 Gospodarcza (JDG)", englishName: "Sole Proprietorship" },
    { code: "SP_ZOO", localName: "Sp\u00f3\u0142ka z ograniczon\u0105 odpowiedzialno\u015bci\u0105 (Sp. z o.o.)", englishName: "Private Limited Company" },
    { code: "SA", localName: "Sp\u00f3\u0142ka Akcyjna (SA)", englishName: "Joint-Stock Company" },
    { code: "SC", localName: "Sp\u00f3\u0142ka Cywilna (SC)", englishName: "Civil Partnership" },
    { code: "SJ", localName: "Sp\u00f3\u0142ka Jawna (SJ)", englishName: "General Partnership" },
    { code: "SK", localName: "Sp\u00f3\u0142ka Komandytowa (SK)", englishName: "Limited Partnership" },
    { code: "PSA", localName: "Prosta Sp\u00f3\u0142ka Akcyjna (PSA)", englishName: "Simple Joint-Stock Company" },
  ],

  // ── Czech Republic ──
  CZ: [
    { code: "SOLE_PROPRIETORSHIP", localName: "\u017divnostn\u00edk", englishName: "Sole Proprietorship" },
    { code: "SRO", localName: "Spole\u010dnost s ru\u010den\u00edm omezen\u00fdm (s.r.o.)", englishName: "Limited Liability Company" },
    { code: "AS", localName: "Akciov\u00e1 spole\u010dnost (a.s.)", englishName: "Joint-Stock Company" },
    { code: "VOS", localName: "Ve\u0159ejn\u00e1 obchodn\u00ed spole\u010dnost (v.o.s.)", englishName: "General Partnership" },
    { code: "KS", localName: "Komanditn\u00ed spole\u010dnost (k.s.)", englishName: "Limited Partnership" },
    { code: "DRUZSTVO", localName: "Dru\u017estvo", englishName: "Cooperative" },
  ],

  // ── Switzerland ──
  CH: [
    { code: "EINZELFIRMA", localName: "Einzelfirma / Einzelunternehmen", englishName: "Sole Proprietorship" },
    { code: "GMBH", localName: "GmbH / S\u00e0rl", englishName: "Limited Liability Company" },
    { code: "AG", localName: "AG / SA", englishName: "Stock Corporation" },
    { code: "KOLLEKTIVGESELLSCHAFT", localName: "Kollektivgesellschaft", englishName: "General Partnership" },
    { code: "KOMMANDITGESELLSCHAFT", localName: "Kommanditgesellschaft", englishName: "Limited Partnership" },
    { code: "GENOSSENSCHAFT", localName: "Genossenschaft", englishName: "Cooperative" },
    { code: "STIFTUNG", localName: "Stiftung", englishName: "Foundation" },
    { code: "VEREIN", localName: "Verein", englishName: "Association" },
  ],

  // ── Austria ──
  AT: [
    { code: "EINZELUNTERNEHMEN", localName: "Einzelunternehmen", englishName: "Sole Proprietorship" },
    { code: "GMBH", localName: "Gesellschaft mit beschr\u00e4nkter Haftung (GmbH)", englishName: "Limited Liability Company" },
    { code: "AG", localName: "Aktiengesellschaft (AG)", englishName: "Stock Corporation" },
    { code: "OG", localName: "Offene Gesellschaft (OG)", englishName: "General Partnership" },
    { code: "KG", localName: "Kommanditgesellschaft (KG)", englishName: "Limited Partnership" },
    { code: "GENOSSENSCHAFT", localName: "Genossenschaft", englishName: "Cooperative" },
  ],

  // ── Ireland ──
  IE: [
    { code: "SOLE_TRADER", localName: "Sole Trader", englishName: "Sole Trader" },
    { code: "LTD", localName: "Private Company Limited by Shares (Ltd)", englishName: "Private Limited" },
    { code: "DAC", localName: "Designated Activity Company (DAC)", englishName: "DAC" },
    { code: "PLC", localName: "Public Limited Company (PLC)", englishName: "PLC" },
    { code: "CLG", localName: "Company Limited by Guarantee (CLG)", englishName: "CLG" },
    { code: "PARTNERSHIP", localName: "Partnership", englishName: "Partnership" },
    { code: "LP", localName: "Limited Partnership", englishName: "Limited Partnership" },
  ],

  // ── Singapore ──
  SG: [
    { code: "SOLE_PROPRIETORSHIP", localName: "Sole Proprietorship", englishName: "Sole Proprietorship" },
    { code: "PARTNERSHIP", localName: "Partnership", englishName: "Partnership" },
    { code: "LP", localName: "Limited Partnership", englishName: "Limited Partnership" },
    { code: "LLP", localName: "Limited Liability Partnership", englishName: "LLP" },
    { code: "PTE_LTD", localName: "Private Limited Company", englishName: "Pte Ltd" },
    { code: "LTD", localName: "Public Company Limited by Shares", englishName: "Public Limited" },
    { code: "COOPERATIVE", localName: "Cooperative", englishName: "Cooperative" },
  ],

  // ── Hong Kong ──
  HK: [
    { code: "SOLE_PROPRIETORSHIP", localName: "Sole Proprietorship", englishName: "Sole Proprietorship" },
    { code: "PARTNERSHIP", localName: "Partnership", englishName: "Partnership" },
    { code: "LTD", localName: "Private Company Limited by Shares", englishName: "Ltd" },
    { code: "PLC", localName: "Public Company Limited by Shares", englishName: "Public Limited" },
    { code: "CLG", localName: "Company Limited by Guarantee", englishName: "CLG" },
  ],

  // ── South Korea ──
  KR: [
    { code: "SOLE_PROPRIETORSHIP", localName: "\uAC1C\uC778\uC0AC\uC5C5\uC790 (Gaein Saeopja)", englishName: "Sole Proprietorship" },
    { code: "JUSIKHOESA", localName: "\uC8FC\uC2DD\uD68C\uC0AC (Jusikhoesa)", englishName: "Stock Corporation" },
    { code: "YUHANHOESA", localName: "\uC720\uD55C\uD68C\uC0AC (Yuhanhoesa)", englishName: "Private Limited Company" },
    { code: "YUHANCHAEGIMHOESA", localName: "\uC720\uD55C\uCC45\uC784\uD68C\uC0AC (Yuhanchaegimhoesa)", englishName: "Limited Liability Company" },
    { code: "HAMMYEONGHOESA", localName: "\uD569\uBA85\uD68C\uC0AC (Hammyeonghoesa)", englishName: "General Partnership" },
    { code: "HAPJAHOESA", localName: "\uD569\uC790\uD68C\uC0AC (Hapjahoesa)", englishName: "Limited Partnership" },
  ],

  // ── China ──
  CN: [
    { code: "SOLE_PROPRIETORSHIP", localName: "\u4E2A\u4F53\u5DE5\u5546\u6237 (G\u011Bt\u01D0 G\u014Dngsh\u0101ngh\u00F9)", englishName: "Sole Proprietorship" },
    { code: "LLC", localName: "\u6709\u9650\u8D23\u4EFB\u516C\u53F8 (Y\u01D2uxi\u00E0n Z\u00E9r\u00E8n G\u014Dngs\u012B)", englishName: "Limited Liability Company" },
    { code: "JSC", localName: "\u80A1\u4EFD\u6709\u9650\u516C\u53F8 (G\u01D4f\u00E8n Y\u01D2uxi\u00E0n G\u014Dngs\u012B)", englishName: "Joint-Stock Company" },
    { code: "PARTNERSHIP", localName: "\u5408\u4F19\u4F01\u4E1A (H\u00E9hu\u01D2 Q\u01D0y\u00E8)", englishName: "Partnership" },
    { code: "WFOE", localName: "Wholly Foreign-Owned Enterprise", englishName: "WFOE" },
    { code: "JV", localName: "Joint Venture", englishName: "Joint Venture" },
    { code: "COOPERATIVE", localName: "Cooperative", englishName: "Cooperative" },
  ],

  // ── Mexico ──
  MX: [
    { code: "PERSONA_FISICA", localName: "Persona F\u00edsica con Actividad Empresarial", englishName: "Sole Proprietorship" },
    { code: "SA_DE_CV", localName: "Sociedad An\u00f3nima de Capital Variable (SA de CV)", englishName: "Variable Capital Corporation" },
    { code: "SRL_DE_CV", localName: "Sociedad de Responsabilidad Limitada de CV", englishName: "LLC with Variable Capital" },
    { code: "SAS", localName: "Sociedad por Acciones Simplificada (SAS)", englishName: "Simplified Stock Company" },
    { code: "SC", localName: "Sociedad Civil (SC)", englishName: "Civil Partnership" },
    { code: "SNC", localName: "Sociedad en Nombre Colectivo (SNC)", englishName: "General Partnership" },
  ],

  // ── United Arab Emirates ──
  AE: [
    { code: "SOLE_ESTABLISHMENT", localName: "Sole Establishment", englishName: "Sole Establishment" },
    { code: "LLC", localName: "Limited Liability Company", englishName: "LLC" },
    { code: "CIVIL_COMPANY", localName: "Civil Company", englishName: "Professional Company" },
    { code: "PJSC", localName: "Public Joint Stock Company", englishName: "PJSC" },
    { code: "PRJSC", localName: "Private Joint Stock Company", englishName: "PrJSC" },
    { code: "PARTNERSHIP", localName: "General Partnership", englishName: "Partnership" },
    { code: "FZE", localName: "Free Zone Establishment", englishName: "Free Zone Establishment" },
    { code: "FZLLC", localName: "Free Zone LLC", englishName: "Free Zone LLC" },
    { code: "OFFSHORE", localName: "Offshore Company", englishName: "Offshore Company" },
  ],

  // ── Saudi Arabia ──
  SA: [
    { code: "SOLE_PROPRIETORSHIP", localName: "Sole Proprietorship", englishName: "Sole Proprietorship" },
    { code: "LLC", localName: "Limited Liability Company", englishName: "LLC" },
    { code: "JSC", localName: "Joint-Stock Company", englishName: "JSC" },
    { code: "PARTNERSHIP", localName: "General Partnership", englishName: "Partnership" },
    { code: "LP", localName: "Limited Partnership", englishName: "Limited Partnership" },
    { code: "PROFESSIONAL_COMPANY", localName: "Professional Company", englishName: "Professional Company" },
  ],

  // ── Israel ──
  IL: [
    { code: "SOLE_PROPRIETORSHIP", localName: "Osek Murshe / Osek Patur", englishName: "Sole Proprietorship" },
    { code: "LTD", localName: "Private Company", englishName: "Ltd" },
    { code: "PLC", localName: "Public Company", englishName: "Public Limited" },
    { code: "PARTNERSHIP", localName: "Partnership (Shutafut)", englishName: "Partnership" },
    { code: "LP", localName: "Limited Partnership", englishName: "LP" },
    { code: "COOPERATIVE", localName: "Cooperative Society", englishName: "Cooperative" },
    { code: "AMUTA", localName: "Amuta", englishName: "Non-Profit Organization" },
  ],

  // ── South Africa ──
  ZA: [
    { code: "SOLE_PROPRIETORSHIP", localName: "Sole Proprietorship", englishName: "Sole Proprietorship" },
    { code: "PTY_LTD", localName: "Private Company", englishName: "(Pty) Ltd" },
    { code: "LTD", localName: "Public Company", englishName: "Ltd" },
    { code: "INC", localName: "Personal Liability Company", englishName: "Inc" },
    { code: "NPC", localName: "Non-Profit Company", englishName: "NPC" },
    { code: "CC", localName: "Close Corporation", englishName: "CC" },
    { code: "PARTNERSHIP", localName: "Partnership", englishName: "Partnership" },
    { code: "TRUST", localName: "Trust", englishName: "Trust" },
    { code: "COOPERATIVE", localName: "Cooperative", englishName: "Cooperative" },
  ],

  // ── Nigeria ──
  NG: [
    { code: "SOLE_PROPRIETORSHIP", localName: "Business Name / Sole Proprietorship", englishName: "Sole Proprietorship" },
    { code: "LTD", localName: "Private Limited Company", englishName: "Ltd" },
    { code: "PLC", localName: "Public Limited Company", englishName: "PLC" },
    { code: "CLG", localName: "Company Limited by Guarantee", englishName: "Non-Profit" },
    { code: "LLP", localName: "Limited Liability Partnership", englishName: "LLP" },
    { code: "PARTNERSHIP", localName: "Partnership", englishName: "Partnership" },
  ],

  // ── Kenya ──
  KE: [
    { code: "SOLE_PROPRIETORSHIP", localName: "Sole Proprietorship / Business Name", englishName: "Sole Proprietorship" },
    { code: "LTD", localName: "Private Limited Company", englishName: "Ltd" },
    { code: "PLC", localName: "Public Limited Company", englishName: "PLC" },
    { code: "CLG", localName: "Company Limited by Guarantee", englishName: "CLG" },
    { code: "PARTNERSHIP", localName: "Partnership", englishName: "Partnership" },
    { code: "LLP", localName: "Limited Liability Partnership", englishName: "LLP" },
    { code: "COOPERATIVE", localName: "Cooperative Society", englishName: "Cooperative" },
  ],

  // ── Indonesia ──
  ID: [
    { code: "UD", localName: "Usaha Dagang (UD)", englishName: "Sole Proprietorship" },
    { code: "CV", localName: "Commanditaire Vennootschap (CV)", englishName: "Limited Partnership" },
    { code: "FIRMA", localName: "Firma (Fa)", englishName: "General Partnership" },
    { code: "PT", localName: "Perseroan Terbatas (PT)", englishName: "Private Limited Company" },
    { code: "PT_TBK", localName: "Perseroan Terbuka (Tbk)", englishName: "Public Limited Company" },
    { code: "KOPERASI", localName: "Koperasi", englishName: "Cooperative" },
    { code: "YAYASAN", localName: "Yayasan", englishName: "Foundation" },
  ],

  // ── Philippines ──
  PH: [
    { code: "SOLE_PROPRIETORSHIP", localName: "Sole Proprietorship", englishName: "Sole Proprietorship" },
    { code: "PARTNERSHIP", localName: "Partnership", englishName: "Partnership" },
    { code: "CORPORATION", localName: "Domestic Corporation", englishName: "Corporation" },
    { code: "OPC", localName: "One Person Corporation", englishName: "One Person Corporation" },
    { code: "COOPERATIVE", localName: "Cooperative", englishName: "Cooperative" },
    { code: "NON_STOCK", localName: "Non-Stock Corporation", englishName: "Non-Profit Corporation" },
  ],

  // ── Thailand ──
  TH: [
    { code: "SOLE_PROPRIETORSHIP", localName: "Sole Proprietorship", englishName: "Sole Proprietorship" },
    { code: "PARTNERSHIP", localName: "Ordinary Partnership", englishName: "Partnership" },
    { code: "LTD_PARTNERSHIP", localName: "Limited Partnership", englishName: "Limited Partnership" },
    { code: "CO_LTD", localName: "Private Limited Company", englishName: "Co., Ltd." },
    { code: "PCL", localName: "Public Company Limited", englishName: "Public Limited" },
  ],

  // ── Vietnam ──
  VN: [
    { code: "SOLE_PROPRIETORSHIP", localName: "Private Enterprise", englishName: "Sole Proprietorship" },
    { code: "LLC_SINGLE", localName: "Single-Member LLC", englishName: "Single-Member LLC" },
    { code: "LLC_MULTI", localName: "Multi-Member LLC", englishName: "Multi-Member LLC" },
    { code: "JSC", localName: "Joint-Stock Company", englishName: "Joint-Stock Company" },
    { code: "PARTNERSHIP", localName: "Partnership Company", englishName: "Partnership" },
  ],

  // ── Taiwan ──
  TW: [
    { code: "SOLE_PROPRIETORSHIP", localName: "\u7368\u8CC7 (D\u00FAz\u012B)", englishName: "Sole Proprietorship" },
    { code: "PARTNERSHIP", localName: "\u5408\u590F (H\u00E9hu\u01D2)", englishName: "Partnership" },
    { code: "LLC", localName: "\u6709\u9650\u516C\u53F8 (Y\u01D2uxi\u00E0n G\u014Dngs\u012B)", englishName: "Limited Company" },
    { code: "COMPANY_LTD", localName: "\u80A1\u4EFD\u6709\u9650\u516C\u53F8 (G\u01D4f\u00E8n Y\u01D2uxi\u00E0n G\u014Dngs\u012B)", englishName: "Company Limited by Shares" },
  ],

  // ── New Zealand ──
  NZ: [
    { code: "SOLE_TRADER", localName: "Sole Trader", englishName: "Sole Trader" },
    { code: "PARTNERSHIP", localName: "Partnership", englishName: "Partnership" },
    { code: "LTD", localName: "Limited Company", englishName: "Ltd" },
    { code: "LP", localName: "Limited Partnership", englishName: "LP" },
    { code: "LTC", localName: "Look-Through Company", englishName: "Look-Through Company" },
    { code: "COOPERATIVE", localName: "Co-operative Company", englishName: "Cooperative" },
  ],
};

// Generic fallback for countries not explicitly listed
export const GENERIC_BUSINESS_TYPES: BusinessType[] = [
  { code: "SOLE_PROPRIETORSHIP", localName: "Sole Proprietorship", englishName: "Sole Proprietorship" },
  { code: "PARTNERSHIP", localName: "Partnership", englishName: "Partnership" },
  { code: "CORPORATION", localName: "Corporation / Company", englishName: "Corporation / Company" },
  { code: "NONPROFIT", localName: "Non-Profit / Charity", englishName: "Non-Profit / Charity" },
  { code: "COOPERATIVE", localName: "Cooperative", englishName: "Cooperative" },
  { code: "OTHER", localName: "Other", englishName: "Other" },
];

export function getBusinessTypesForCountry(countryCode: string): BusinessType[] {
  return BUSINESS_TYPES[countryCode] ?? GENERIC_BUSINESS_TYPES;
}

export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export function isValidBusinessType(countryCode: string, businessTypeCode: string): boolean {
  const types = getBusinessTypesForCountry(countryCode);
  return types.some((t) => t.code === businessTypeCode);
}
