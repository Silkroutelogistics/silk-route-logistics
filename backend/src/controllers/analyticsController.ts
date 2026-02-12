import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import * as analytics from "../services/analyticsService";

function parseDateRange(query: any): analytics.DateRange {
  const now = new Date();
  const start = query.start ? new Date(query.start) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = query.end ? new Date(query.end) : now;
  // Ensure end is end of day
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function buildFilters(req: AuthRequest): analytics.AnalyticsFilters {
  const filters: analytics.AnalyticsFilters = {};
  const role = req.user!.role;
  filters.userRole = role;

  if (role === "CARRIER") {
    filters.carrierId = req.user!.id;
  } else if (role === "BROKER" || role === "AE") {
    filters.userId = req.user!.id;
  }
  // ADMIN, CEO, ACCOUNTING, OPERATIONS, DISPATCH see everything

  if (req.query.equipment_type) filters.equipmentType = req.query.equipment_type as string;
  if (req.query.carrier_id) filters.carrierId = req.query.carrier_id as string;
  if (req.query.shipper_id) filters.shipperId = req.query.shipper_id as string;

  return filters;
}

export async function getRevenue(req: AuthRequest, res: Response) {
  try {
    const range = parseDateRange(req.query);
    const groupBy = (req.query.group_by as string) || "day";
    const filters = buildFilters(req);
    const data = await analytics.getRevenueMetrics(range, groupBy, filters);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

export async function getLoads(req: AuthRequest, res: Response) {
  try {
    const range = parseDateRange(req.query);
    const filters = buildFilters(req);
    const data = await analytics.getLoadMetrics(range, filters);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

export async function getOnTime(req: AuthRequest, res: Response) {
  try {
    const range = parseDateRange(req.query);
    const filters = buildFilters(req);
    const data = await analytics.getOnTimeMetrics(range, filters);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

export async function getLanes(req: AuthRequest, res: Response) {
  try {
    const range = parseDateRange(req.query);
    const filters = buildFilters(req);
    const sort = (req.query.sort as string) || "margin";
    const limit = parseInt(req.query.limit as string) || 50;
    const data = await analytics.getLaneProfitability(range, filters, sort, limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

export async function getCarriers(req: AuthRequest, res: Response) {
  try {
    const range = parseDateRange(req.query);
    const filters = buildFilters(req);
    const sort = (req.query.sort as string) || "score";
    const limit = parseInt(req.query.limit as string) || 50;
    const data = await analytics.getCarrierScorecard(range, filters, sort, limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

export async function getShippers(req: AuthRequest, res: Response) {
  try {
    const range = parseDateRange(req.query);
    const filters = buildFilters(req);
    const sort = (req.query.sort as string) || "revenue";
    const limit = parseInt(req.query.limit as string) || 50;
    const data = await analytics.getShipperScorecard(range, filters, sort, limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

export async function getCashFlow(req: AuthRequest, res: Response) {
  try {
    const range = parseDateRange(req.query);
    const data = await analytics.getCashFlowMetrics(range);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

export async function getARAging(req: AuthRequest, res: Response) {
  try {
    const data = await analytics.getARAgingMetrics();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

export async function getAP(req: AuthRequest, res: Response) {
  try {
    const range = parseDateRange(req.query);
    const data = await analytics.getAPMetrics(range);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

export async function getShipperCredit(req: AuthRequest, res: Response) {
  try {
    const data = await analytics.getShipperCreditHealth();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

export async function getCarrierEarnings(req: AuthRequest, res: Response) {
  try {
    const range = parseDateRange(req.query);
    const data = await analytics.getCarrierEarnings(range, req.user!.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

export async function exportReport(req: AuthRequest, res: Response) {
  try {
    const { report_type, date_range, format } = req.body;
    const range: analytics.DateRange = {
      start: new Date(date_range?.start || new Date().toISOString().slice(0, 8) + "01"),
      end: new Date(date_range?.end || new Date().toISOString()),
    };
    const filters = buildFilters(req);
    const data = await analytics.exportData(report_type || "revenue", range, filters);

    if (format === "csv") {
      const rows = flattenToCSV(data);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="srl_${report_type}_${range.start.toISOString().split("T")[0]}.csv"`);
      res.send(rows);
    } else {
      // Return JSON data for client-side PDF generation
      res.json({ data, reportType: report_type, dateRange: { start: range.start, end: range.end } });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

function flattenToCSV(data: any): string {
  // Handle different data shapes
  let rows: any[] = [];
  if (data.series) rows = data.series;
  else if (data.lanes) rows = data.lanes;
  else if (data.carriers) rows = data.carriers;
  else if (data.shippers) rows = data.shippers;
  else if (data.trend) rows = data.trend;
  else if (Array.isArray(data)) rows = data;
  else rows = [data.totals || data];

  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      if (typeof val === "string" && val.includes(",")) return `"${val}"`;
      if (val instanceof Date) return val.toISOString();
      return String(val);
    }).join(","));
  });
  return lines.join("\n");
}
