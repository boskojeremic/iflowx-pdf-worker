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

  const previewUrl =
    `${baseUrl}/fop-preview/${encodeURIComponent(reportCode)}` +
    `?date=${encodeURIComponent(reportDate)}` +
    `&rev=${encodeURIComponent(String(revisionNo))}` +
    `&pdf=1` +
    `&key=${encodeURIComponent(pdfSecret)}`;

  let browser: Browser | null = null;

  try {
    const isLinuxRuntime = process.platform === "linux";

    browser = await chromium.launch({
      headless: true,
      args: isLinuxRuntime
        ? [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-zygote",
            "--single-process",
          ]
        : [],
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

    // 🔥 FORCE WHITE BACKGROUND (glavni fix za crno)
    await page.evaluate(() => {
      document.documentElement.style.background = "#ffffff";
      document.documentElement.style.margin = "0";
      document.documentElement.style.padding = "0";

      document.body.style.background = "#ffffff";
      document.body.style.margin = "0";
      document.body.style.padding = "0";

      const root =
        document.getElementById("__next") ||
        document.getElementById("pdf-report") ||
        document.querySelector("main");

      if (root instanceof HTMLElement) {
        root.style.background = "#ffffff";
        root.style.margin = "0";
        root.style.padding = "0";
      }
    });

    await page.waitForSelector("#pdf-report", { timeout: 30000 });
    await page.emulateMedia({ media: "print" });

    await page.addStyleTag({
      content: `
        @page {
          size: A4;
        }

        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #0f172a !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        #__next,
        #pdf-report,
        main {
          background: #ffffff !important;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        thead {
          display: table-header-group;
        }

        tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        td, th {
          vertical-align: top;
        }
      `,
    });

    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      preferCSSPageSize: false,
      headerTemplate: `
        <div style="
          width: 100%;
          height: 0;
          font-size: 0;
          color: transparent;
        "></div>
      `,
      footerTemplate: `
        <div style="
          width: 100%;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 9px;
          color: #6b7280;
          padding: 0 10mm 6mm 10mm;
          box-sizing: border-box;
          text-align: right;
        ">
          Page&nbsp;<span class="pageNumber"></span>&nbsp;of&nbsp;<span class="totalPages"></span>
        </div>
      `,
      margin: {
        top: "12mm",
        right: "10mm",
        bottom: "20mm",
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