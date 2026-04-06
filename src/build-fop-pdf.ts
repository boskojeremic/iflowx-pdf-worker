import { chromium, type Browser } from "playwright";

type BuildFopPdfParams = {
  reportCode: string;
  reportDate: string;
  revisionNo: number;
  documentNumber: string;
};

function safe(value: string) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function buildFopPdf({
  reportCode,
  reportDate,
  revisionNo,
  documentNumber,
}: BuildFopPdfParams): Promise<Buffer> {
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    throw new Error("APP_URL or NEXT_PUBLIC_APP_URL is not configured.");
  }

  const pdfSecret = process.env.PDF_INTERNAL_SECRET;
  if (!pdfSecret) {
    throw new Error("PDF_INTERNAL_SECRET is not configured.");
  }

  const fileName = `${safe(documentNumber)}.pdf`;

  const previewUrl =
    `${baseUrl}/fop-preview/${encodeURIComponent(reportCode)}` +
    `?date=${encodeURIComponent(reportDate)}` +
    `&rev=${encodeURIComponent(String(revisionNo))}` +
    `&pdf=1` +
    `&key=${encodeURIComponent(pdfSecret)}`;

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process",
      ],
    });

    const page = await browser.newPage();

    const response = await page.goto(previewUrl, {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    if (!response || !response.ok()) {
      throw new Error(
        `Preview page failed: ${response?.status() ?? "NO_RESPONSE"} ${response?.url() ?? previewUrl}`
      );
    }

    await page.waitForSelector("#pdf-report", { timeout: 30000 });
    await page.emulateMedia({ media: "print" });

    await page.addStyleTag({
      content: `
        @page {
          size: A4;
          margin: 0;
        }

        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #0f172a !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        #pdf-report {
          background: #ffffff !important;
        }

        table {
          page-break-inside: auto;
        }

        thead {
          display: table-header-group;
        }

        tr, td, th {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      `,
    });

    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="
          width: 100%;
          height: 0px;
          background: #ffffff;
          color: transparent;
          font-size: 1px;
        ">
          .
        </div>
      `,
      footerTemplate: `
        <div style="
          width: 100%;
          background: #ffffff;
          color: #6b7280;
          font-size: 9px;
          padding: 0 10mm 4px 10mm;
          box-sizing: border-box;
          font-family: Arial, Helvetica, sans-serif;
          display: flex;
          justify-content: flex-end;
          align-items: center;
        ">
          Page&nbsp;<span class="pageNumber"></span>&nbsp;of&nbsp;<span class="totalPages"></span>
        </div>
      `,
      margin: {
        top: "0mm",
        right: "10mm",
        bottom: "14mm",
        left: "10mm",
      },
    });

    return Buffer.from(pdfBytes);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}