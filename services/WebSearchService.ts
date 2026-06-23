import axios from 'axios';
import { redis, isUpstashConfigured } from '../utils/upstash';

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

interface CacheEntry {
    results: SearchResult[];
    timestamp: number;
}

const memoryCache: { [query: string]: CacheEntry } = {};
const CACHE_TTL_SECONDS = 600; // 10 minutes

export class WebSearchService {
    /**
     * Searches the web using DuckDuckGo HTML interface and returns structured results.
     */
    static async searchWeb(query: string): Promise<SearchResult[]> {
        const normalizedQuery = query.trim().toLowerCase();
        const cacheKey = `search:${normalizedQuery}`;

        // Attempt Upstash Redis cache first
        if (isUpstashConfigured) {
            try {
                const cached = await redis.get<SearchResult[]>(cacheKey);
                if (cached) {
                    console.log(`[WebSearchService] Upstash Redis cache hit for: "${query}"`);
                    return cached;
                }
            } catch (err: any) {
                console.warn('[WebSearchService] Redis cache lookup failed:', err.message);
            }
        } else {
            const now = Date.now();
            if (memoryCache[normalizedQuery] && (now - memoryCache[normalizedQuery].timestamp < CACHE_TTL_SECONDS * 1000)) {
                console.log(`[WebSearchService] Memory cache hit for: "${query}"`);
                return memoryCache[normalizedQuery].results;
            }
        }

        console.log(`[WebSearchService] Querying DuckDuckGo: "${query}"`);
        try {
            // DuckDuckGo HTML endpoint
            const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
                timeout: 10000
            });

            const html = response.data;
            const results: SearchResult[] = [];

            // Regex to find each result block
            const resultBlockRegex = /<div class="[^"]*result__body[^"]*"[\s\S]*?<div class="result__snippet"[^>]*>([\s\S]*?)<\/div>/g;
            let match;

            while ((match = resultBlockRegex.exec(html)) !== null) {
                const block = match[0];

                // Extract href
                const urlMatch = /class="result__a"[^>]*href="([^"]+)"/.exec(block);
                // Extract title
                const titleMatch = /class="result__a"[^>]*>([\s\S]*?)<\/a>/.exec(block);
                // Extract snippet
                const snippetMatch = /class="result__snippet"[^>]*>([\s\S]*?)<\/div>/.exec(block);

                if (urlMatch && titleMatch) {
                    const rawUrl = urlMatch[1];
                    let decodedUrl = rawUrl;

                    // DuckDuckGo sometimes wraps URLs in redirect links: /l/?kh=-1&uddg=https%3A%2F%2Fexample.com
                    if (rawUrl.startsWith('/l/?') || rawUrl.includes('uddg=')) {
                        const uddgMatch = /[?&]uddg=([^&]+)/.exec(rawUrl);
                        if (uddgMatch) {
                            decodedUrl = decodeURIComponent(uddgMatch[1]);
                        }
                    }

                    results.push({
                        title: this.cleanHtml(titleMatch[1]),
                        url: decodedUrl,
                        snippet: snippetMatch ? this.cleanHtml(snippetMatch[1]) : ''
                    });
                }

                if (results.length >= 8) {
                    break; // Cap at 8 results
                }
            }

            // Cache results
            if (isUpstashConfigured) {
                try {
                    await redis.set(cacheKey, results, CACHE_TTL_SECONDS);
                    console.log(`[WebSearchService] Cached results in Upstash Redis for: "${query}"`);
                } catch (err: any) {
                    console.warn('[WebSearchService] Redis cache write failed:', err.message);
                }
            } else {
                memoryCache[normalizedQuery] = {
                    results,
                    timestamp: Date.now()
                };
                console.log(`[WebSearchService] Cached results in Memory for: "${query}"`);
            }

            return results;

        } catch (error: any) {
            console.error('[WebSearchService] Search failed:', error.message);
            // Return empty list on failure rather than throwing
            return [];
        }
    }

    private static cleanHtml(html: string): string {
        return html
            .replace(/<[^>]+>/g, '') // strip tags
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, '/')
            .replace(/\s+/g, ' ')
            .trim();
    }
}
