import './_bootstrap.js';
import fs from 'node:fs/promises';
import { authorizeRequest } from '../lib/activation.js';
import { handleOpenDayWorkbookParse } from '../modules/open-day/interfaces/http/openDayWorkbookParseHandler.js';
import { getFirstFieldValue, parseMultipartUpload } from './_request.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  const authorization = authorizeRequest(req, 'open-day');
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    const { fields, files } = await parseMultipartUpload(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file?.filepath) {
      return res.status(400).send('缺少 Excel 文件。');
    }

    const buffer = await fs.readFile(file.filepath);
    const payload = await handleOpenDayWorkbookParse({
      buffer,
      requestedSheet: getFirstFieldValue(fields.sheet),
      originalFilename: file.originalFilename || file.newFilename || '开放日工作簿.xlsx',
      contentType: file.mimetype || '',
      persistArtifact: !getFirstFieldValue(fields.sheet),
    });
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(400).send(error instanceof Error ? error.message : 'Excel 解析失败');
  }
}
