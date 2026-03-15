import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const WIDTH = 1200;
const HEIGHT = 630;

// Read the logo SVG and inline it
const logoSvg = fs.readFileSync(
  path.join(process.cwd(), "public/logo.svg"),
  "utf-8"
);
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

// Load fonts as base64
const FONT_DIR = "/home/meszmate/.claude/skills/canvas-design/canvas-fonts";
const instrumentSansB64 = fs.readFileSync(path.join(FONT_DIR, "InstrumentSans-Bold.ttf")).toString("base64");
const instrumentSansRegB64 = fs.readFileSync(path.join(FONT_DIR, "InstrumentSans-Regular.ttf")).toString("base64");
const geistMonoB64 = fs.readFileSync(path.join(FONT_DIR, "GeistMono-Regular.ttf")).toString("base64");
const instrumentSerifItalicB64 = fs.readFileSync(path.join(FONT_DIR, "InstrumentSerif-Italic.ttf")).toString("base64");

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @font-face { font-family: 'InstrumentSans'; src: url(data:font/ttf;base64,${instrumentSansB64}) format('truetype'); font-weight: 700; }
  @font-face { font-family: 'InstrumentSans'; src: url(data:font/ttf;base64,${instrumentSansRegB64}) format('truetype'); font-weight: 400; }
  @font-face { font-family: 'GeistMono'; src: url(data:font/ttf;base64,${geistMonoB64}) format('truetype'); }
  @font-face { font-family: 'InstrumentSerif'; src: url(data:font/ttf;base64,${instrumentSerifItalicB64}) format('truetype'); font-style: italic; }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    background: #050e0a;
    font-family: 'InstrumentSans', sans-serif;
    position: relative;
  }

  /* === BACKGROUND === */
  .bg-gradient {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 60% 70% at 38% 50%, rgba(5,150,105,0.10) 0%, transparent 100%),
      radial-gradient(ellipse 50% 60% at 75% 40%, rgba(52,211,153,0.04) 0%, transparent 100%);
  }
  .grid-layer {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(16,185,129,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(16,185,129,0.03) 1px, transparent 1px);
    background-size: 30px 30px;
  }

  /* === CARD STYLE === */
  .card {
    position: absolute;
    background: rgba(10,20,16,0.85);
    border: 1px solid rgba(52,211,153,0.12);
    border-radius: 8px;
    padding: 14px 16px;
    backdrop-filter: blur(8px);
    z-index: 8;
  }
  .card-title {
    font-family: 'GeistMono', monospace;
    font-size: 8.5px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: rgba(52,211,153,0.45);
    margin-bottom: 8px;
  }
  .card-value {
    font-family: 'InstrumentSans', sans-serif;
    font-weight: 700;
    font-size: 22px;
    color: #d1fae5;
    letter-spacing: -0.5px;
    line-height: 1;
  }
  .card-sub {
    font-family: 'GeistMono', monospace;
    font-size: 9px;
    color: rgba(52,211,153,0.35);
    margin-top: 4px;
  }
  .card-positive { color: #34d399; }
  .card-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 0;
    border-bottom: 1px solid rgba(52,211,153,0.06);
    font-family: 'GeistMono', monospace;
    font-size: 9px;
    color: rgba(167,243,208,0.5);
  }
  .card-row:last-child { border-bottom: none; }
  .card-row-label { color: rgba(167,243,208,0.35); }
  .card-row-value { color: rgba(167,243,208,0.7); }

  /* === BAR CHART === */
  .bar-chart {
    display: flex;
    align-items: flex-end;
    gap: 5px;
    height: 50px;
    margin-top: 8px;
  }
  .bar {
    width: 14px;
    border-radius: 2px 2px 0 0;
    background: rgba(5,150,105,0.5);
  }
  .bar.accent { background: rgba(52,211,153,0.7); }
  .bar-labels {
    display: flex;
    gap: 5px;
    margin-top: 4px;
  }
  .bar-label {
    width: 14px;
    text-align: center;
    font-family: 'GeistMono', monospace;
    font-size: 6.5px;
    color: rgba(52,211,153,0.25);
  }

  /* === SPARKLINE (SVG) === */
  .sparkline-wrap { margin-top: 10px; }

  /* === DONUT === */
  .donut-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 6px;
  }
  .donut-legend {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .donut-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: 'GeistMono', monospace;
    font-size: 8px;
    color: rgba(167,243,208,0.5);
  }
  .donut-swatch {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  /* === TRANSACTION LIST === */
  .tx-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 0;
    border-bottom: 1px solid rgba(52,211,153,0.05);
    font-family: 'GeistMono', monospace;
    font-size: 8.5px;
  }
  .tx-row:last-child { border-bottom: none; }
  .tx-label { color: rgba(167,243,208,0.45); }
  .tx-amount { color: rgba(167,243,208,0.7); }
  .tx-credit { color: #34d399; }
  .tx-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    margin-right: 6px;
    display: inline-block;
  }

  /* === CENTER CONTENT === */
  .center-block {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 10;
  }
  .logo-mark {
    width: 68px;
    height: 54px;
    margin-bottom: 18px;
    filter: drop-shadow(0 0 35px rgba(52,211,153,0.3)) drop-shadow(0 0 70px rgba(52,211,153,0.12));
  }
  .wordmark {
    font-weight: 700;
    font-size: 58px;
    letter-spacing: -2.5px;
    color: #f0fdf4;
    line-height: 1;
    margin-bottom: 10px;
    text-shadow: 0 0 50px rgba(52,211,153,0.12);
  }
  .tagline {
    font-family: 'InstrumentSerif', serif;
    font-style: italic;
    font-size: 20px;
    color: rgba(167,243,208,0.55);
    margin-bottom: 20px;
  }
  .url-badge {
    font-family: 'GeistMono', monospace;
    font-size: 11px;
    letter-spacing: 2px;
    color: rgba(52,211,153,0.5);
    border: 1px solid rgba(52,211,153,0.15);
    border-radius: 20px;
    padding: 6px 18px;
    background: rgba(5,150,105,0.06);
  }

  /* === PILL TAGS at bottom === */
  .pills {
    position: absolute;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    z-index: 10;
  }
  .pill {
    font-family: 'GeistMono', monospace;
    font-size: 8px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: rgba(52,211,153,0.3);
    border: 1px solid rgba(52,211,153,0.08);
    border-radius: 10px;
    padding: 3px 10px;
    background: rgba(5,150,105,0.04);
  }

  /* === EDGE VIGNETTE === */
  .vignette {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(to right, rgba(5,14,10,0.85) 0%, transparent 12%, transparent 88%, rgba(5,14,10,0.85) 100%),
      linear-gradient(to bottom, rgba(5,14,10,0.6) 0%, transparent 15%, transparent 85%, rgba(5,14,10,0.6) 100%);
    z-index: 9;
    pointer-events: none;
  }

</style>
</head>
<body>

  <div class="bg-gradient"></div>
  <div class="grid-layer"></div>
  <div class="vignette"></div>

  <!-- ===================== LEFT SIDE CARDS ===================== -->

  <!-- Revenue card (top-left) -->
  <div class="card" style="top:32px;left:28px;width:200px;">
    <div class="card-title">Revenue</div>
    <div class="card-value">$124,850</div>
    <div class="card-sub"><span class="card-positive">+12.4%</span> vs last month</div>
    <div class="sparkline-wrap">
      <svg width="172" height="32" viewBox="0 0 172 32">
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(52,211,153,0.15)"/>
            <stop offset="100%" stop-color="rgba(52,211,153,0)"/>
          </linearGradient>
        </defs>
        <path d="M0,28 L20,24 L40,26 L60,18 L80,20 L100,12 L120,14 L140,6 L160,8 L172,4" fill="none" stroke="#34d399" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M0,28 L20,24 L40,26 L60,18 L80,20 L100,12 L120,14 L140,6 L160,8 L172,4 L172,32 L0,32 Z" fill="url(#sg)"/>
      </svg>
    </div>
  </div>

  <!-- P&L bar chart (mid-left) -->
  <div class="card" style="top:195px;left:40px;width:180px;">
    <div class="card-title">P&L Monthly</div>
    <div class="bar-chart">
      <div class="bar" style="height:20px;"></div>
      <div class="bar" style="height:28px;"></div>
      <div class="bar" style="height:22px;"></div>
      <div class="bar" style="height:35px;"></div>
      <div class="bar" style="height:30px;"></div>
      <div class="bar accent" style="height:42px;"></div>
      <div class="bar" style="height:38px;"></div>
      <div class="bar accent" style="height:50px;"></div>
    </div>
    <div class="bar-labels">
      <div class="bar-label">J</div>
      <div class="bar-label">F</div>
      <div class="bar-label">M</div>
      <div class="bar-label">A</div>
      <div class="bar-label">M</div>
      <div class="bar-label">J</div>
      <div class="bar-label">J</div>
      <div class="bar-label">A</div>
    </div>
  </div>

  <!-- Quick stat (bottom-left) -->
  <div class="card" style="bottom:60px;left:28px;width:170px;">
    <div class="card-title">Accounts Receivable</div>
    <div class="card-value">$38,420</div>
    <div class="card-sub">14 open invoices</div>
  </div>

  <!-- ===================== RIGHT SIDE CARDS ===================== -->

  <!-- Transaction feed (top-right) -->
  <div class="card" style="top:32px;right:28px;width:220px;">
    <div class="card-title">Recent Transactions</div>
    <div class="tx-row">
      <span class="tx-label"><span class="tx-dot" style="background:#34d399;"></span>INV-0042 paid</span>
      <span class="tx-amount tx-credit">+$2,400</span>
    </div>
    <div class="tx-row">
      <span class="tx-label"><span class="tx-dot" style="background:#059669;"></span>Bill #187</span>
      <span class="tx-amount">-$890</span>
    </div>
    <div class="tx-row">
      <span class="tx-label"><span class="tx-dot" style="background:#34d399;"></span>INV-0041 paid</span>
      <span class="tx-amount tx-credit">+$5,100</span>
    </div>
    <div class="tx-row">
      <span class="tx-label"><span class="tx-dot" style="background:#059669;"></span>Payroll run</span>
      <span class="tx-amount">-$12,500</span>
    </div>
    <div class="tx-row">
      <span class="tx-label"><span class="tx-dot" style="background:#34d399;"></span>INV-0039 paid</span>
      <span class="tx-amount tx-credit">+$1,750</span>
    </div>
  </div>

  <!-- Asset donut (mid-right) -->
  <div class="card" style="top:215px;right:36px;width:200px;">
    <div class="card-title">Asset Allocation</div>
    <div class="donut-wrap">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r="20" fill="none" stroke="rgba(52,211,153,0.15)" stroke-width="6"/>
        <circle cx="26" cy="26" r="20" fill="none" stroke="#34d399" stroke-width="6" stroke-dasharray="50 76" stroke-dashoffset="0" transform="rotate(-90 26 26)"/>
        <circle cx="26" cy="26" r="20" fill="none" stroke="#059669" stroke-width="6" stroke-dasharray="30 96" stroke-dashoffset="-50" transform="rotate(-90 26 26)"/>
        <circle cx="26" cy="26" r="20" fill="none" stroke="#20b2aa" stroke-width="6" stroke-dasharray="20 106" stroke-dashoffset="-80" transform="rotate(-90 26 26)"/>
      </svg>
      <div class="donut-legend">
        <div class="donut-item"><div class="donut-swatch" style="background:#34d399;"></div>Cash 40%</div>
        <div class="donut-item"><div class="donut-swatch" style="background:#059669;"></div>Receivables 24%</div>
        <div class="donut-item"><div class="donut-swatch" style="background:#20b2aa;"></div>Inventory 16%</div>
        <div class="donut-item"><div class="donut-swatch" style="background:rgba(52,211,153,0.15);"></div>Fixed 20%</div>
      </div>
    </div>
  </div>

  <!-- Expenses card (bottom-right) -->
  <div class="card" style="bottom:60px;right:28px;width:200px;">
    <div class="card-title">Expenses This Month</div>
    <div class="card-row"><span class="card-row-label">Payroll</span><span class="card-row-value">$42,800</span></div>
    <div class="card-row"><span class="card-row-label">Operations</span><span class="card-row-value">$18,340</span></div>
    <div class="card-row"><span class="card-row-label">Software</span><span class="card-row-value">$4,290</span></div>
    <div class="card-row"><span class="card-row-label">Marketing</span><span class="card-row-value">$7,150</span></div>
  </div>

  <!-- Small stat cards flanking center -->
  <div class="card" style="top:370px;left:56px;width:130px;padding:10px 14px;">
    <div class="card-title" style="margin-bottom:4px;">Cash Balance</div>
    <div class="card-value" style="font-size:17px;">$87,230</div>
  </div>

  <div class="card" style="top:370px;right:56px;width:130px;padding:10px 14px;">
    <div class="card-title" style="margin-bottom:4px;">Net Profit</div>
    <div class="card-value" style="font-size:17px;color:#34d399;">$21,440</div>
  </div>

  <!-- ===================== CENTER BRANDING ===================== -->
  <div class="center-block">
    <img src="${logoDataUri}" class="logo-mark" />
    <div class="wordmark">dubbl</div>
    <div class="tagline">Business management for modern teams</div>
    <div class="url-badge">dubbl.dev</div>
  </div>

  <!-- Bottom pills -->
  <div class="pills">
    <div class="pill">Accounting</div>
    <div class="pill">Projects</div>
    <div class="pill">Inventory</div>
    <div class="pill">Payroll</div>
    <div class="pill">CRM</div>
    <div class="pill">Open Source</div>
  </div>

</body>
</html>`;

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "networkidle0" });

  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 500));

  const outPath = path.join(process.cwd(), "public/og.jpg");
  await page.screenshot({
    path: outPath,
    type: "jpeg",
    quality: 95,
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });

  // Also save a PNG version for higher quality
  const pngPath = path.join(process.cwd(), "public/og.png");
  await page.screenshot({
    path: pngPath,
    type: "png",
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });

  await browser.close();
  console.log(`Saved: ${outPath} and ${pngPath}`);
}

main().catch(console.error);
