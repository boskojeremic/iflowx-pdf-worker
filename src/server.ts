import "dotenv/config";
import express from "express";
import { buildFopPdf } from "./build-fop-pdf.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "iflowx-pdf-worker",
  });
});

app.post("/generate-fop-pdf", async (req, res) => {
  try {
    console.log("EXPECTED SECRET =", process.env.WORKER_SHARED_SECRET);
    console.log("INCOMING SECRET =", req.header("x-worker-secret"));
    const workerSecret = process.env.WORKER_SHARED_SECRET;
    const incomingSecret = req.header("x-worker-secret");

    if (!workerSecret || incomingSecret !== workerSecret) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }

    const { reportCode, reportDate, revisionNo } = req.body ?? {};

    if (!reportCode || !reportDate || revisionNo === undefined || revisionNo === null) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields: reportCode, reportDate, revisionNo",
      });
    }

    const pdfBuffer = await buildFopPdf({
      reportCode: String(reportCode),
      reportDate: String(reportDate),
      revisionNo: Number(revisionNo),
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${String(reportCode)}-${String(reportDate)}-R${String(revisionNo)}.pdf"`
    );

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error("generate-fop-pdf error:", error);

    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`PDF worker running on port ${PORT}`);
});