import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import type { DocumentModel, FileFormat, PdfExportOptions } from './shared/types.ts';
import { generateDocxBuffer, generatePdfBuffer, generateXlsxBuffer } from './server/generators.ts';
import { parseDocxDocument, parseExcelDocument, parsePdfDocument } from './server/parsers.ts';
import { createSampleFileBuffer } from './server/samples.ts';
import { getAvailableTargets, recomputeStats } from './server/stats.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max
  },
});

function detectFormatFromFile(fileName: string, mimeType: string): FileFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') return 'pdf';
  if (
    lower.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.csv') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'text/csv'
  ) {
    return 'xlsx';
  }
  return null;
}

function getMimeAndExtension(target: FileFormat): { mime: string; ext: string } {
  if (target === 'pdf') return { mime: 'application/pdf', ext: 'pdf' };
  if (target === 'docx') {
    return {
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ext: 'docx',
    };
  }
  return {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/sample/:format', async (req, res) => {
    try {
      const fmt = req.params.format as FileFormat;
      if (fmt !== 'pdf' && fmt !== 'docx' && fmt !== 'xlsx') {
        res.status(400).json({ error: 'Unsupported sample format. Use pdf, docx, or xlsx.' });
        return;
      }
      const { buffer, fileName, mimeType } = await createSampleFileBuffer(fmt);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate sample file.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/inspect', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No file was uploaded.' });
        return;
      }

      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const safeName = /[\u1200-\u137F]/.test(originalName) ? originalName : file.originalname;

      const sourceFormat = detectFormatFromFile(safeName, file.mimetype);
      if (!sourceFormat) {
        res.status(400).json({
          error: 'Unsupported file format. Please upload a PDF (.pdf), Word (.docx), or Excel (.xlsx, .xls, .csv) file.',
        });
        return;
      }

      let document: DocumentModel;
      if (sourceFormat === 'pdf') {
        document = await parsePdfDocument(file.buffer, safeName, file.size);
      } else if (sourceFormat === 'docx') {
        document = await parseDocxDocument(file.buffer, safeName, file.size);
      } else {
        document = await parseExcelDocument(file.buffer, safeName, file.size);
      }

      res.json({
        document,
        availableTargets: getAvailableTargets(sourceFormat),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Document inspection failed.';
      const status = message.includes('GEMINI_API_KEY') ? 400 : 500;
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/export', async (req, res) => {
    try {
      const { document, targetFormat, pdfOptions } = req.body as {
        document?: DocumentModel;
        targetFormat?: FileFormat;
        pdfOptions?: PdfExportOptions;
      };

      if (!document || !targetFormat) {
        res.status(400).json({ error: 'Missing document model or target format.' });
        return;
      }
      if (targetFormat !== 'pdf' && targetFormat !== 'docx' && targetFormat !== 'xlsx') {
        res.status(400).json({ error: 'Invalid target format.' });
        return;
      }

      const cleanDoc = recomputeStats(document);
      let outputBuffer: Buffer;
      if (targetFormat === 'docx') {
        outputBuffer = await generateDocxBuffer(cleanDoc);
      } else if (targetFormat === 'xlsx') {
        outputBuffer = await generateXlsxBuffer(cleanDoc);
      } else {
        outputBuffer = await generatePdfBuffer(cleanDoc, pdfOptions);
      }

      const baseName = (cleanDoc.stats.fileName || cleanDoc.title || 'converted').replace(/\.[^.]+$/, '');
      const { mime, ext } = getMimeAndExtension(targetFormat);
      const outputName = `${baseName}.${ext}`;
      const asciiFallback = `${baseName.replace(/[^\x20-\x7E]/g, '_') || 'converted'}.${ext}`;

      res.setHeader('Content-Type', mime);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(outputName)}`
      );
      res.send(outputBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export converted file.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FidelDocs server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
