import { config } from '../config';
import { search as duckDuckSearch, SafeSearchType } from 'duck-duck-scrape';

// In-memory page content cache for pagination support
const pageCache = new Map<string, string>();
const PAGE_SIZE = 8000;

// Detect if query is a direct URL or domain
const DOMAIN_REGEX = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,10}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)$/;

function looksLikeUrl(q: string): boolean {
    return DOMAIN_REGEX.test(q.trim());
}

function normalizeUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return 'https://' + url;
}

export const webToolsDefinitions = [
    {
        name: "search_web",
        description: "Search the web for real-time information on any topic, company, person, event, or query. Can handle topical searches, company names, or full URLs. Always use this to get current information before answering questions about the world.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "The search query, topic, company name, URL, or domain to look up." }
            },
            required: ["query"],
            additionalProperties: false
        }
    },
    {
        name: "read_webpage",
        description: "Fetch and read the content of a specific URL. Returns clean Markdown. Use after search_web for full page details. Supports pagination: if the page was truncated, call again with the same URL and offset=8000 (then 16000, etc.) to read the next section.",
        parameters: {
            type: "object",
            properties: {
                url: { type: "string", description: "The full URL to read." },
                offset: { type: "number", description: "Character offset to start reading from (default 0). Use multiples of 8000 to paginate through long pages." }
            },
            required: ["url"],
            additionalProperties: false
        }
    },
    {
        name: "crawl_website",
        description: "Read a webpage and recursively fetch its subpages. Good for grabbing documentation, guides, or whole site context. Use this instead of read_webpage if you think the specific page lacks enough info and you need the surrounding site context.",
        parameters: {
            type: "object",
            properties: {
                url: { type: "string", description: "The starting URL to crawl." },
                maxPages: { type: "number", description: "Maximum number of pages to read (default 3, max 10)." }
            },
            required: ["url"],
            additionalProperties: false
        }
    }
];

// ── Tavily Search (real web search for topics, companies, news) ──
async function tavilySearch(query: string): Promise<string | null> {
    if (!config.TAVILY_API_KEY) return null;

    try {
        console.log(`[Web Search] Tavily search: "${query}"`);
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: config.TAVILY_API_KEY,  // Tavily key goes in body, NOT Authorization header
                query,
                search_depth: 'basic',
                include_answer: true,
                include_raw_content: true,
                max_results: 6,
                include_images: false
            }),
            signal: AbortSignal.timeout(20000)
        });

        if (!response.ok) {
            const err = await response.text();
            console.error(`[Web Search] Tavily HTTP ${response.status}: ${err}`);
            return null;
        }

        const data = await response.json() as any;

        // Format the response for the LLM
        let output = '';

        if (data.answer) {
            output += `**Summary:** ${data.answer}\n\n`;
        }

        if (data.results && data.results.length > 0) {
            output += `**Sources:**\n`;
            for (const r of data.results) {
                output += `\n- **${r.title}**\n  ${r.content}\n  🔗 ${r.url}\n`;
            }
        }

        return output.trim() || null;

    } catch (e: any) {
        if (e.name === 'TimeoutError') {
            console.error('[Web Search] Tavily timed out');
        } else {
            console.error('[Web Search] Tavily error:', e.message);
        }
        return null;
    }
}

// ── DuckDuckGo Search (Free fallback via scraping) ──
async function duckDuckGoSearch(query: string): Promise<string | null> {
    try {
        console.log(`[Web Search] DDG search: "${query}"`);
        const searchResults = await duckDuckSearch(query, {
            safeSearch: SafeSearchType.MODERATE,
        });
        
        if (!searchResults.results || searchResults.results.length === 0) return null;

        let output = `**DuckDuckGo Search Results:**\n\n`;
        for (const r of searchResults.results.slice(0, 10)) {
            output += `- **${r.title}**\n  ${r.description}\n  🔗 ${r.url}\n\n`;
        }
        return output.trim();
    } catch (e: any) {
        console.error('[Web Search] DDG error:', e.message);
        return null;
    }
}

// ── Jina Reader (best for reading a specific URL as clean Markdown) ──
async function jinaRead(url: string): Promise<string | null> {
    try {
        const response = await fetch(`https://r.jina.ai/${url}`, {
            method: 'GET',
            headers: {
                'Accept': 'text/plain',
                'X-Return-Format': 'markdown',
            },
            signal: AbortSignal.timeout(20000)
        });
        if (!response.ok) return null;
        const text = await response.text();
        if (!text || text.trim().length < 50) return null;
        return text;
    } catch {
        return null;
    }
}

export async function searchWeb(args: Record<string, any>): Promise<string> {
    const query = args.query?.trim();
    if (!query) return "Error: No search query provided.";

    // ── Strategy 1: Direct URL/domain → read via Jina Reader ──
    if (looksLikeUrl(query)) {
        const fullUrl = normalizeUrl(query);
        console.log(`[Web Search] URL detected → reading directly: ${fullUrl}`);
        const content = await jinaRead(fullUrl);
        if (content) {
            pageCache.set(fullUrl, content);
            const trimmed = content.length > PAGE_SIZE
                ? content.substring(0, PAGE_SIZE) + `\n\n...[TRUNCATED — call read_webpage with url="${fullUrl}" and offset=${PAGE_SIZE} to read more]`
                : content;
            return `CONTENT FROM ${fullUrl}:\n\n${trimmed}`;
        }
        return `Could not read ${fullUrl}. The site may require login or block scrapers.`;
    }

    // ── Strategy 2: Real web search via Tavily ──
    const tavilyResult = await tavilySearch(query);
    if (tavilyResult) {
        return `**Web Search Results for "${query}":**\n\n${tavilyResult}`;
    }

    // ── Strategy 3: DuckDuckGo Fallback ──
    const ddgResult = await duckDuckGoSearch(query);
    if (ddgResult) {
        return ddgResult;
    }

    // ── Strategy 4: Fallback — try Jina search, then guess domain ──
    console.log(`[Web Search] Tavily failed, trying Jina fallback...`);
    try {
        const encodedQuery = encodeURIComponent(query);
        const jinaResp = await fetch(`https://s.jina.ai/${encodedQuery}`, {
            headers: { 'Accept': 'text/plain' },
            signal: AbortSignal.timeout(15000)
        });
        if (jinaResp.ok) {
            const text = await jinaResp.text();
            if (text && text.trim().length > 80) {
                return `**Web Search Results for "${query}":**\n\n${text.substring(0, 10000)}`;
            }
        }
    } catch { /* silent fail */ }

    // Last resort: guess domain from bare word
    const domainGuess = `https://${query.toLowerCase().replace(/\s+/g, '')}.com`;
    console.log(`[Web Search] Trying domain fallback: ${domainGuess}`);
    const domainContent = await jinaRead(domainGuess);
    if (domainContent) {
        const trimmed = domainContent.length > 16000 ? domainContent.substring(0, 16000) + "\n\n...[TRUNCATED]..." : domainContent;
        return `Couldn't find general results. Found this at ${domainGuess}:\n\n${trimmed}`;
    }

    return `No results found for "${query}". Try rephrasing, using a more specific query, or providing a full URL.`;
}

export async function readWebpage(args: Record<string, any>): Promise<string> {
    let { url, offset = 0 } = args;
    url = url?.trim();
    if (!url) return "Error: No URL provided.";
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    // Use cached content if available (avoids re-fetching for pagination)
    let content = pageCache.get(url) ?? null;
    if (!content) {
        console.log(`[Web Reader] Fetching via Jina Reader: ${url}`);
        content = await jinaRead(url);
        if (!content) {
            return `Could not read ${url}. The page may require login or block scrapers.`;
        }
        pageCache.set(url, content);
        if (pageCache.size > 20) {
            const oldest = pageCache.keys().next().value;
            if (oldest) pageCache.delete(oldest);
        }
    }

    const start = Math.min(offset, content.length);
    const end = start + PAGE_SIZE;
    const slice = content.substring(start, end);
    const hasMore = end < content.length;
    const totalPages = Math.ceil(content.length / PAGE_SIZE);
    const currentPage = Math.floor(start / PAGE_SIZE) + 1;

    const suffix = hasMore
        ? `\n\n...[Page ${currentPage}/${totalPages} — call read_webpage with url="${url}" and offset=${end} for next section]`
        : `\n\n[End of content — ${totalPages} page(s) total]`;

    return `CONTENT FROM ${url} (chars ${start}–${Math.min(end, content.length)} of ${content.length}):\n\n${slice}${suffix}`;
}

export async function crawlWebsite(args: Record<string, any>): Promise<string> {
    let { url, maxPages = 3 } = args;
    url = url?.trim();
    if (!url) return "Error: No URL provided.";
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    maxPages = Math.min(Math.max(1, maxPages), 10);
    console.log(`[Web Crawler] Crawling ${url} up to ${maxPages} pages...`);

    const mainPage = await jinaRead(url);
    if (!mainPage) {
        return `Could not read ${url} to start crawling.`;
    }

    // Extract markdown links
    const linkRegex = /\[.*?\]\((https?:\/\/[^\s\)]+)\)/g;
    const linksFound = new Set<string>();
    let match;
    while ((match = linkRegex.exec(mainPage)) !== null) {
        const linkUrl = match[1];
        try {
            if (new URL(linkUrl).hostname === new URL(url).hostname) {
                if (linkUrl !== url) linksFound.add(linkUrl);
            }
        } catch { /* malformed url */ }
    }

    const linksToCrawl = Array.from(linksFound).slice(0, maxPages - 1);
    let output = `**CRAWL RESULTS FOR ${url}**\n\n=== Main Page ===\n${mainPage.substring(0, 10000)}...\n\n`;

    if (linksToCrawl.length > 0) {
        console.log(`[Web Crawler] Found ${linksFound.size} subpages on same domain, fetching ${linksToCrawl.length}...`);
        
        const subPageResults = await Promise.all(
            linksToCrawl.map(async (link) => {
                const subContent = await jinaRead(link);
                if (subContent) {
                    return `=== Subpage: ${link} ===\n${subContent.substring(0, 8000)}...`;
                }
                return null;
            })
        );

        output += subPageResults.filter(Boolean).join('\n\n');
    } else {
        output += `\n(No internal links found to crawl further.)`;
    }

    const trimmed = output.length > 24000 ? output.substring(0, 24000) + "\n\n...[TRUNCATED ALONG WITH SUBPAGES]..." : output;
    return trimmed;
}
