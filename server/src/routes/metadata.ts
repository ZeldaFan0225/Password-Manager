import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { JSDOM } from 'jsdom';

interface SiteMeta {
    title: string;
    iconPath: string | null;
    baseDomain: string;
}

interface RouteGenericFetchMeta {
    Body: {
        url: string;
    };
}

interface RouteGenericFetchIcon {
    Querystring: {
        domain: string;
    };
}

// Extract base domain from URL
function extractBaseDomain(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (err) {
        console.error('Failed to extract domain:', err);
        return url;
    }
}

// Find icon URL from HTML
async function findIconUrl(url: string): Promise<string | undefined> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = await response.text();
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        // Look for icon links in order of preference
        const iconLink = 
            doc.querySelector('link[rel="icon"]') || 
            doc.querySelector('link[rel="shortcut icon"]') ||
            doc.querySelector('link[rel="apple-touch-icon"]') ||
            doc.querySelector('link[rel="apple-touch-icon-precomposed"]');
        
        let iconPath = iconLink?.getAttribute('href');
        
        // If no icon found in link tags, use default favicon.ico
        if (!iconPath) {
            iconPath = '/favicon.ico';
        }

        // Resolve relative URLs to absolute
        return new URL(iconPath, url).href;
    } catch (err) {
        console.error('Failed to find icon URL:', err);
        return undefined;
    }
}

// Extract title from domain (e.g., "google.com" -> "Google")
function extractTitleFromDomain(domain: string): string {
    // Remove TLD and split by dots or dashes
    const parts = domain.split('.')[0]?.split(/[-_.]/) || ['unknown'];
    
    // Capitalize first letter of each part
    return parts.map(part => 
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    ).join(' ');
}

// Fetch site metadata
async function fetchSiteMeta(url: string): Promise<SiteMeta | undefined> {
    try {
        // Extract base domain first
        const baseDomain = extractBaseDomain(url);
        
        // Try to fetch the website
        try {
            const response = await fetch(url);
            const html = await response.text();
            const dom = new JSDOM(html);
            const doc = dom.window.document;

            // Get title
            const title = doc.querySelector('title')?.textContent?.trim() || '';
            
            // For icon, we'll use our proxy endpoint
            const iconPath = `/api/metadata/icon?domain=${encodeURIComponent(baseDomain)}`;

            return {
                title: title || extractTitleFromDomain(baseDomain),
                iconPath,
                baseDomain
            };
        } catch (fetchErr) {
            console.error('Failed to fetch website:', fetchErr);
            
            // If we can't fetch the website, create metadata with domain-based title
            return {
                title: extractTitleFromDomain(baseDomain),
                iconPath: null, // No icon available
                baseDomain
            };
        }
    } catch (err) {
        console.error('Failed to process site metadata:', err);
        return undefined;
    }
}

export async function metadataRoutes(server: FastifyInstance) {
    // Fetch metadata endpoint
    server.post<RouteGenericFetchMeta>('/metadata/fetch', {
        schema: {
            security: [{ bearerAuth: [] }],
            body: Type.Object({
                url: Type.String(),
            }),
            response: {
                200: Type.Object({
                    meta: Type.Optional(Type.Object({
                        title: Type.String(),
                        iconPath: Type.Union([Type.String(), Type.Null()]),
                        baseDomain: Type.String(),
                    })),
                }),
            },
        },
    }, async (request) => {
        try {
            const meta = await fetchSiteMeta(request.body.url);
            return { meta };
        } catch (err) {
            server.log.error(err);
            return { meta: undefined };
        }
    });

    // Icon proxy endpoint - no authentication required
    server.get<RouteGenericFetchIcon>('/metadata/icon', {
        schema: {
            querystring: Type.Object({
                domain: Type.String(),
            }),
            security: [], // Empty security array means no authentication required
        },
    }, async (request, reply) => {
        try {
            const { domain } = request.query;
            const url = `https://${domain}`;
            
            try {
                // Find the icon URL
                const iconUrl = await findIconUrl(url);
                
                if (!iconUrl) {
                    throw new Error('Icon URL not found');
                }
                
                // Fetch the icon with timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
                
                const response = await fetch(iconUrl, { 
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch icon: ${response.status}`);
                }
                
                // Get content type
                const contentType = response.headers.get('content-type') || 'image/x-icon';
                
                // Get icon data
                const iconData = await response.arrayBuffer();
                
                // Send the icon with appropriate headers
                reply
                    .header('Content-Type', contentType)
                    .header('Cache-Control', 'public, max-age=86400') // Cache for 24 hours
                    .header('Access-Control-Allow-Origin', '*') // Allow cross-origin requests
                    .header('Cross-Origin-Resource-Policy', 'cross-origin') // Allow cross-origin resource sharing
                    .send(Buffer.from(iconData));
            } catch (iconErr) {
                server.log.error(`Error fetching icon for ${domain}:`, iconErr);
                
                // Return a 302 redirect to the default globe icon
                reply.redirect('/globe.svg');
            }
        } catch (err) {
            server.log.error('Failed to process icon request:', err);
            reply.redirect('/globe.svg');
        }
    });
}
