import './_bootstrap.js';

export default async function handler(req: any, res: any) {
  return res.status(200).json({ ok: true, message: 'users placeholder' });
}
