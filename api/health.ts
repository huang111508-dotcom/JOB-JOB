export default function handler(req: any, res: any) {
  res.status(200).json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
}
