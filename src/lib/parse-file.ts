// parse-file.ts — Client-side extraction of plain text from an uploaded sales report (CSV / Excel / PDF) so it
// can ground offer generation. Heavy parsers (xlsx, pdfjs) are dynamically imported only when actually needed,
// keeping them out of the main bundle.

// extractTextFromFile: read a CSV/XLSX/PDF File and return its text content. Params: file = the uploaded File.
// Throws if the file can't be read. Called by the sales-data uploader on the outreach page.
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  // CSV / plain text — read directly.
  if (name.endsWith(".csv") || file.type === "text/csv" || file.type.startsWith("text/")) {
    return (await file.text()).trim();
  }

  // Excel — read every sheet to CSV text via SheetJS.
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    return wb.SheetNames.map((sheet) => `# ${sheet}\n${XLSX.utils.sheet_to_csv(wb.Sheets[sheet])}`)
      .join("\n\n")
      .trim();
  }

  // PDF (text-based) — extract text per page via pdf.js, using a version-matched CDN worker.
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    const trimmed = text.trim();
    if (!trimmed) throw new Error("This PDF has no extractable text (it may be scanned/image-only).");
    return trimmed;
  }

  // Fallback: attempt to read as text.
  return (await file.text()).trim();
}
