import fs from 'node:fs/promises';
import formidable from 'formidable';
import { parseWorkbookBuffer } from '../lib/openDayWorkbook.js';
import { ensureRuntimeTempDir } from '../lib/runtimeTemp.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function parseMultipart(req: any) {
  const uploadDir = await ensureRuntimeTempDir('uploads');
  const form = formidable({
    multiples: false,
    maxFiles: 1,
    uploadDir,
  });

  return new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ fields, files });
    });
  });
}

function getFirstFieldValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : '';
  }

  return typeof value === 'string' ? value.trim() : '';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { fields, files } = await parseMultipart(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file?.filepath) {
      return res.status(400).send('缺少 Excel 文件。');
    }

    const buffer = await fs.readFile(file.filepath);
    const payload = parseWorkbookBuffer(buffer, getFirstFieldValue(fields.sheet));
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(400).send(error instanceof Error ? error.message : 'Excel 解析失败');
  }
}
