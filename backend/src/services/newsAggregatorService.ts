import { prisma } from "../config/database";

// ─── Default RSS Feed Sources ─────────────────────────────────────

const DEFAULT_SOURCES = [
  {
    name: "FreightWaves",
    feedUrl: "https://www.freightwaves.com/feed",
    iconUrl: "https://www.freightwaves.com/favicon.ico",
    category: "Industry",
  },
  {
    name: "Fleet Owner",
    feedUrl: "https://www.fleetowner.com/rss",
    iconUrl: "https://www.fleetowner.com/favicon.ico",
    category: "Industry",
  },
  {
    name: "Transport Topics",
    feedUrl: "https://www.ttnews.com/rss.xml",
    iconUrl: "https://www.ttnews.com/favicon.ico",
    category: "Industry",
  },
  {
    name: "Trucking Info",
    feedUrl: "https://www.truckinginfo.com/rss",
    iconUrl: "https://www.truckinginfo.com/favicon.ico",
    category: "Equipment",
  },
  {
    name: "Overdrive",
    feedUrl: "https://www.overdriveonline.com/rss",
    iconUrl: "https://www.overdriveonline.com/favicon.ico",
    category: "Industry",
  },
  {
    name: "CCJ",
    feedUrl: "https://www.ccjdigital.com/rss",
    iconUrl: "https://www.ccjdigital.com/favicon.ico",
    category: "Industry",
  },
];

// ─── Category Keywords ────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Technology: [
    "technology", "tech", "software", "ai", "artificial intelligence",
    "automation", "autonomous", "self-driving", "electric", "ev",
    "digital", "app", "platform", "eld", "telematics", "gps",
    "blockchain", "iot", "machine learning", "data", "cyber",
  ],
  Regulations: [
    "regulation", "regulatory", "fmcsa", "dot", "compliance",
    "law", "legislation", "mandate", "rule", "hours of service",
    "hos", "eld mandate", "emission", "epa", "osha", "safety regulation",
    "federal", "bill", "act", "policy", "enforcement",
  ],
  Market: [
    "market", "rate", "rates", "pricing", "freight rate",
    "spot rate", "contract rate", "capacity", "demand", "supply",
    "economy", "economic", "recession", "inflation", "fuel price",
    "diesel", "forecast", "outlook", "trend", "volume",
    "revenue", "profit", "earnings", "stock",
  ],
  Equipment: [
    "equipment", "truck", "trailer", "tractor", "engine",
    "tire", "maintenance", "repair", "fleet", "vehicle",
    "cab", "sleeper", "reefer", "flatbed", "tanker",
    "parts", "dealer", "manufacturer", "recall",
  ],
  Safety: [
    "safety", "accident", "crash", "fatality", "injury",
    "hazmat", "hazardous", "inspection", "violation", "csa",
    "driver safety", "road safety", "weather", "storm",
    "training", "drug test", "alcohol", "distracted driving",
  ],
};

// ─── Utility Functions ────────────────────────────────────────────

/**
 * Generate a URL-friendly slug from a title string.
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

/**
 * Strip CDATA wrappers, HTML tags, and decode common HTML entities.
 */
function stripCdataAndHtml(text: string): string {
  if (!text) return "";
  let clean = text
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "");
  // Remove HTML tags
  clean = clean.replace(/<[^>]*>/g, "");
  // Decode common HTML entities
  clean = clean
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, "...")
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "--")
    .replace(/&nbsp;/g, " ");
  // Collapse whitespace
  clean = clean.replace(/\s+/g, " ").trim();
  return clean;
}

/**
 * Extract the text content between an XML tag (first occurrence).
 */
function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : "";
}

/**
 * Extract an image URL from media:content, media:thumbnail, or enclosure tags.
 */
function extractImage(itemXml: string): string | null {
  // media:content url="..."
  const mediaContent = itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (mediaContent) return mediaContent[1];

  // media:thumbnail url="..."
  const mediaThumbnail = itemXml.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
  if (mediaThumbnail) return mediaThumbnail[1];

  // enclosure url="..." type="image/..."
  const enclosure = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image\/[^"']+["']/i);
  if (enclosure) return enclosure[1];

  // enclosure url="..." (fallback — any enclosure, often an image)
  const enclosureAny = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
  if (enclosureAny) return enclosureAny[1];

  // og:image in content
  const ogImage = itemXml.match(/og:image["']?\s+content=["']([^"']+)["']/i);
  if (ogImage) return ogImage[1];

  return null;
}

/**
 * Extract RSS categories from <category> tags inside an item.
 */
function extractRssCategories(itemXml: string): string[] {
  const categories: string[] = [];
  const regex = /<category[^>]*>([^<]+)<\/category>/gi;
  let match;
  while ((match = regex.exec(itemXml)) !== null) {
    categories.push(stripCdataAndHtml(match[1]));
  }
  return categories;
}

/**
 * Categorize an article based on keyword matching in title and excerpt.
 */
function categorizeArticle(title: string, excerpt: string, rssCategories: string[]): string {
  const text = `${title} ${excerpt} ${rssCategories.join(" ")}`.toLowerCase();

  let bestCategory = "Industry";
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

/**
 * Parse a date string from RSS pubDate into a Date object.
 * Returns null if the date cannot be parsed.
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const cleaned = stripCdataAndHtml(dateStr);
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;
  return d;
}

// ─── RSS Parsing ──────────────────────────────────────────────────

interface ParsedArticle {
  title: string;
  link: string;
  excerpt: string;
  publishedAt: Date;
  imageUrl: string | null;
  category: string;
  tags: string[];
}

/**
 * Parse RSS XML into an array of articles.
 * Handles both RSS 2.0 (<item>) and Atom (<entry>) formats.
 */
function parseRssXml(xml: string, sourceName: string): ParsedArticle[] {
  const articles: ParsedArticle[] = [];

  // Split by <item> or <entry>
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  const entryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;

  let matches: RegExpExecArray | null;
  const items: string[] = [];

  while ((matches = itemRegex.exec(xml)) !== null) {
    items.push(matches[1]);
  }

  // If no <item> blocks found, try Atom <entry>
  if (items.length === 0) {
    while ((matches = entryRegex.exec(xml)) !== null) {
      items.push(matches[1]);
    }
  }

  for (const itemXml of items) {
    try {
      const rawTitle = extractTag(itemXml, "title");
      const title = stripCdataAndHtml(rawTitle);
      if (!title) continue;

      // Extract link — RSS uses <link>, Atom uses <link href="..."/>
      let link = stripCdataAndHtml(extractTag(itemXml, "link"));
      if (!link) {
        const linkHref = itemXml.match(/<link[^>]+href=["']([^"']+)["']/i);
        if (linkHref) link = linkHref[1];
      }
      if (!link) continue;

      // Extract description/summary
      let rawExcerpt = extractTag(itemXml, "description");
      if (!rawExcerpt) rawExcerpt = extractTag(itemXml, "summary");
      if (!rawExcerpt) rawExcerpt = extractTag(itemXml, "content:encoded");
      const excerpt = stripCdataAndHtml(rawExcerpt).slice(0, 500);

      // Extract pubDate
      let dateStr = extractTag(itemXml, "pubDate");
      if (!dateStr) dateStr = extractTag(itemXml, "published");
      if (!dateStr) dateStr = extractTag(itemXml, "dc:date");
      if (!dateStr) dateStr = extractTag(itemXml, "updated");
      const publishedAt = parseDate(dateStr) || new Date();

      // Extract image
      const imageUrl = extractImage(itemXml);

      // Extract RSS categories as tags
      const rssCategories = extractRssCategories(itemXml);

      // Categorize
      const category = categorizeArticle(title, excerpt, rssCategories);

      articles.push({
        title,
        link,
        excerpt: excerpt || `${title} — via ${sourceName}`,
        publishedAt,
        imageUrl,
        category,
        tags: rssCategories.slice(0, 5),
      });
    } catch (err) {
      // Skip individual articles that fail to parse
      console.error(`[News] Error parsing article from ${sourceName}:`, err);
    }
  }

  return articles;
}

// ─── Feed Fetching ────────────────────────────────────────────────

/**
 * Fetch a single RSS feed and store new articles in the database.
 * Returns the number of articles added.
 */
async function fetchFeed(source: { name: string; feedUrl: string; iconUrl?: string | null; category: string; id?: string }): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(source.feedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SRL-NewsAggregator/1.0 (Silk Route Logistics)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[News] Feed ${source.name} returned HTTP ${response.status}`);
      return 0;
    }

    const xml = await response.text();
    const articles = parseRssXml(xml, source.name);
    let added = 0;

    for (const article of articles) {
      try {
        // Check for duplicate by sourceUrl
        const existing = await prisma.newsArticle.findUnique({
          where: { sourceUrl: article.link },
        });
        if (existing) continue;

        // Generate a unique slug
        let slug = generateSlug(article.title);
        const slugExists = await prisma.newsArticle.findUnique({ where: { slug } });
        if (slugExists) {
          slug = `${slug}-${Date.now().toString(36)}`;
        }

        await prisma.newsArticle.create({
          data: {
            title: article.title,
            slug,
            excerpt: article.excerpt,
            sourceUrl: article.link,
            sourceName: source.name,
            sourceIcon: source.iconUrl || null,
            imageUrl: article.imageUrl,
            category: article.category,
            tags: article.tags,
            publishedAt: article.publishedAt,
            featured: false,
          },
        });

        added++;
      } catch (err: any) {
        // Unique constraint violation — skip duplicate
        if (err?.code === "P2002") continue;
        console.error(`[News] Error storing article "${article.title}":`, err?.message || err);
      }
    }

    // Update source metadata
    if (source.id) {
      await prisma.newsSource.update({
        where: { id: source.id },
        data: {
          lastFetched: new Date(),
          articleCount: { increment: added },
        },
      }).catch(() => {}); // Non-critical
    }

    return added;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === "AbortError") {
      console.error(`[News] Feed ${source.name} timed out`);
    } else {
      console.error(`[News] Error fetching ${source.name}:`, err?.message || err);
    }
    return 0;
  }
}

// ─── Exported Functions ───────────────────────────────────────────

/**
 * Fetch articles from all active news sources.
 * Returns a summary of articles added and any errors encountered.
 */
export async function fetchAllFeeds(): Promise<{ articlesAdded: number; errors: string[] }> {
  const errors: string[] = [];
  let totalAdded = 0;

  // Get active sources from the database
  let sources = await prisma.newsSource.findMany({
    where: { isActive: true },
  });

  // Fallback to defaults if no sources in DB
  if (sources.length === 0) {
    await seedNewsSources();
    sources = await prisma.newsSource.findMany({
      where: { isActive: true },
    });
  }

  console.log(`[News] Fetching from ${sources.length} active sources...`);

  for (const source of sources) {
    try {
      const added = await fetchFeed({
        name: source.name,
        feedUrl: source.feedUrl,
        iconUrl: source.iconUrl,
        category: source.category,
        id: source.id,
      });
      totalAdded += added;
      console.log(`[News] ${source.name}: +${added} articles`);
    } catch (err: any) {
      const errorMsg = `${source.name}: ${err?.message || "Unknown error"}`;
      errors.push(errorMsg);
      console.error(`[News] Error with ${source.name}:`, err?.message || err);
    }
  }

  // Auto-feature the most recent articles if none are featured
  try {
    const featuredCount = await prisma.newsArticle.count({ where: { featured: true } });
    if (featuredCount < 4) {
      const latestArticles = await prisma.newsArticle.findMany({
        where: { featured: false },
        orderBy: { publishedAt: "desc" },
        take: 4 - featuredCount,
        select: { id: true },
      });
      if (latestArticles.length > 0) {
        await prisma.newsArticle.updateMany({
          where: { id: { in: latestArticles.map((a) => a.id) } },
          data: { featured: true },
        });
      }
    }
  } catch (err) {
    console.error("[News] Error auto-featuring articles:", err);
  }

  console.log(`[News] Fetch complete: ${totalAdded} articles added, ${errors.length} errors`);
  return { articlesAdded: totalAdded, errors };
}

/**
 * Get paginated articles with optional category filter and search.
 */
export async function getArticles(
  page: number = 1,
  limit: number = 12,
  category?: string,
  search?: string
): Promise<{
  articles: any[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const where: any = {};

  if (category && category !== "All") {
    where.category = category;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { excerpt: { contains: search, mode: "insensitive" } },
      { sourceName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [articles, total] = await Promise.all([
    prisma.newsArticle.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.newsArticle.count({ where }),
  ]);

  return {
    articles,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get a single article by slug.
 */
export async function getArticle(slug: string) {
  return prisma.newsArticle.findUnique({
    where: { slug },
  });
}

/**
 * Get featured articles, falling back to the most recent if not enough are featured.
 */
export async function getFeaturedArticles(limit: number = 4) {
  let articles = await prisma.newsArticle.findMany({
    where: { featured: true },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });

  // Fallback to latest articles if not enough featured
  if (articles.length < limit) {
    const remaining = limit - articles.length;
    const existingIds = articles.map((a) => a.id);
    const more = await prisma.newsArticle.findMany({
      where: {
        id: { notIn: existingIds },
      },
      orderBy: { publishedAt: "desc" },
      take: remaining,
    });
    articles = [...articles, ...more];
  }

  return articles;
}

/**
 * Get distinct categories with article counts.
 */
export async function getCategories(): Promise<{ category: string; count: number }[]> {
  const results = await prisma.newsArticle.groupBy({
    by: ["category"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  return results.map((r) => ({
    category: r.category,
    count: r._count.id,
  }));
}

/**
 * Upsert the default news sources into the NewsSource table.
 */
export async function seedNewsSources(): Promise<void> {
  console.log("[News] Seeding default news sources...");

  for (const source of DEFAULT_SOURCES) {
    await prisma.newsSource.upsert({
      where: { name: source.name },
      update: {
        feedUrl: source.feedUrl,
        iconUrl: source.iconUrl,
        category: source.category,
      },
      create: {
        name: source.name,
        feedUrl: source.feedUrl,
        iconUrl: source.iconUrl,
        category: source.category,
        isActive: true,
        articleCount: 0,
      },
    });
  }

  console.log(`[News] Seeded ${DEFAULT_SOURCES.length} news sources`);
}
