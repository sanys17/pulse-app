import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.ULTRAHUMAN_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "ULTRAHUMAN_API_TOKEN not configured" });
  }

  const date = req.query.date as string;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "date parameter required (YYYY-MM-DD)" });
  }

  const url = `https://partner.ultrahuman.com/api/v1/partner/daily_metrics?date=${date}`;

  const response = await fetch(url, {
    headers: { Authorization: token },
  });

  const data = await response.json();

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  return res.status(response.status).json(data);
}
