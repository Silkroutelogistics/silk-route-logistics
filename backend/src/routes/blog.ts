import { Router, Response } from "express";
import { getArticles, getArticle, getFeaturedArticles, getCategories, fetchAllFeeds, seedNewsSources } from "../services/newsAggregatorService";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";

const router = Router();

// Public routes (no auth needed for blog)
router.get("/posts", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 12);
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;
    const result = await getArticles(page, limit, category, search);
    res.json(result);
  } catch (err) {
    console.error("[Blog] Error fetching posts:", err);
    res.status(500).json({ error: "Failed to fetch articles" });
  }
});

router.get("/posts/featured", async (req, res) => {
  try {
    const limit = Math.min(10, parseInt(req.query.limit as string) || 4);
    const articles = await getFeaturedArticles(limit);
    res.json(articles);
  } catch (err) {
    console.error("[Blog] Error fetching featured posts:", err);
    res.status(500).json({ error: "Failed to fetch featured articles" });
  }
});

router.get("/posts/:slug", async (req, res) => {
  try {
    const article = await getArticle(req.params.slug);
    if (!article) return res.status(404).json({ error: "Article not found" });
    res.json(article);
  } catch (err) {
    console.error("[Blog] Error fetching article:", err);
    res.status(500).json({ error: "Failed to fetch article" });
  }
});

router.get("/categories", async (_req, res) => {
  try {
    const categories = await getCategories();
    res.json(categories);
  } catch (err) {
    console.error("[Blog] Error fetching categories:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// Admin: trigger manual feed fetch
router.post("/fetch", authenticate, authorize("ADMIN") as any, async (req: AuthRequest, res: Response) => {
  try {
    const result = await fetchAllFeeds();
    res.json(result);
  } catch (err) {
    console.error("[Blog] Error fetching feeds:", err);
    res.status(500).json({ error: "Failed to fetch feeds" });
  }
});

export default router;
