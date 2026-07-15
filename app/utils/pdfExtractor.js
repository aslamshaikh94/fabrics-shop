/**
 * Extract text content from a PDF file using pdfjs-dist.
 * Returns the raw text from all pages concatenated.
 */
export async function extractPdfText(file) {
  const pdfjsLib = await import("pdfjs-dist");

  // Use CDN worker with matching version
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Group items by their Y position (row) to preserve table structure
    const rows = {};
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      if (!rows[y]) rows[y] = [];
      rows[y].push({ text: item.str, x: item.transform[4] });
    }
    const sortedY = Object.keys(rows)
      .map(Number)
      .sort((a, b) => b - a);
    for (const y of sortedY) {
      rows[y].sort((a, b) => a.x - b.x);
      fullText += rows[y].map((item) => item.text).join(" ") + "\n";
    }
  }

  return fullText;
}

/**
 * Parse raw PDF text to extract fabric entries.
 * Uses a flexible approach:
 * 1. Find all lines containing "MTR" (case-insensitive)
 * 2. For each MTR line, look backwards to find the product name and amount
 * 3. Calculate rate per meter from amount / quantity
 */
export function parseFabricEntries(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Log ALL lines for debugging
  console.log("=== ALL EXTRACTED LINES ===");
  lines.forEach((l, i) => console.log(`${i}: "${l}"`));
  console.log("=== END ===");

  const entries = [];

  // Find all MTR lines
  const mtrLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes("mtr")) {
      mtrLines.push(i);
    }
  }
  console.log("MTR lines at indices:", mtrLines);

  // For each MTR line, look backwards to find the product info
  for (const mtrIdx of mtrLines) {
    const mtrLine = lines[mtrIdx].toLowerCase();

    // Extract quantity from MTR line
    const qtyMatch = mtrLine.match(/mtr\s*([\d.,]+)/);
    if (!qtyMatch) continue;

    const qty = parseFloat(qtyMatch[1].replace(/,/g, ""));
    if (!qty || qty <= 0 || qty > 10000) {
      console.log(`  Skipping MTR line ${mtrIdx}: invalid qty ${qty}`);
      continue;
    }

    console.log(`\nProcessing MTR at line ${mtrIdx}: qty=${qty}`);

    // Look backwards up to 5 lines to find product name and amount
    let productName = null;
    let amount = null;

    for (
      let lookback = 1;
      lookback <= 5 && mtrIdx - lookback >= 0;
      lookback++
    ) {
      const prevLine = lines[mtrIdx - lookback];
      const prevNum = parseFloat(prevLine.replace(/,/g, ""));

      console.log(`  Lookback ${lookback}: "${prevLine}" (num=${prevNum})`);

      if (!isNaN(prevNum) && prevNum > 0) {
        // This could be the amount
        if (!amount) {
          amount = prevNum;
          console.log(`    -> Found amount: ${amount}`);
        }
      } else if (/[a-zA-Z]/.test(prevLine)) {
        // This has text - could be product name
        if (!productName) {
          productName = prevLine;
          console.log(`    -> Found product name: "${productName}"`);
        }
      }
    }

    if (productName && amount && amount > 0) {
      // Clean up product name
      let name = productName;
      // Remove leading HSN code (5-6 digit number)
      name = name.replace(/^\d{5,6}\s*/, "").trim();
      // Remove trailing tax rate number
      name = name.replace(/\d+\.?\d*$/, "").trim();
      // Remove trailing dots/hyphens
      name = name.replace(/[.\-]+$/, "").trim();

      if (name.length >= 2) {
        const rate = Math.round((amount / qty) * 100) / 100;
        console.log(
          `  -> Extracted: name="${name}", qty=${qty}, amount=${amount}, rate=${rate}`,
        );

        if (rate > 0) {
          entries.push({
            fabric_name: name,
            total_meters: String(qty),
            purchase_price_per_meter: String(rate),
            quantity: "1",
          });
        }
      }
    } else {
      console.log(`  -> Could not find product info for MTR at line ${mtrIdx}`);
    }
  }

  console.log(`\nTotal entries found: ${entries.length}`);
  return entries;
}
