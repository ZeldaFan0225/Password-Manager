import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { JSDOM } from 'jsdom';

// Dictionary of known services and their domains
const KNOWN_SERVICES: Record<string, string> = {
    // Social Media
    'twitter.com': 'Twitter',
    'x.com': 'Twitter',
    'facebook.com': 'Facebook',
    'instagram.com': 'Instagram',
    'linkedin.com': 'LinkedIn',
    'reddit.com': 'Reddit',
    'discord.com': 'Discord',
    'slack.com': 'Slack',
    'telegram.org': 'Telegram',

    // Email & Communication
    'gmail.com': 'Gmail',
    'outlook.com': 'Outlook',
    'proton.me': 'Proton Mail',
    'tutanota.com': 'Tutanota',
    'zoom.us': 'Zoom',

    // Cloud Services
    'github.com': 'GitHub',
    'gitlab.com': 'GitLab',
    'bitbucket.org': 'Bitbucket',
    'aws.amazon.com': 'Amazon AWS',
    'cloud.google.com': 'Google Cloud',
    'azure.microsoft.com': 'Microsoft Azure',
    'digitalocean.com': 'DigitalOcean',
    'heroku.com': 'Heroku',
    'netlify.com': 'Netlify',
    'vercel.com': 'Vercel',

    // Crypto & Finance
    'binance.com': 'Binance',
    'coinbase.com': 'Coinbase',
    'kraken.com': 'Kraken',
    'paypal.com': 'PayPal',
    'wise.com': 'Wise',
    'revolut.com': 'Revolut',

    // Gaming
    'steam.com': 'Steam',
    'epicgames.com': 'Epic Games',
    'battle.net': 'Battle.net',
    'minecraft.net': 'Minecraft',
    'xbox.com': 'Xbox',
    'playstation.com': 'PlayStation',
    'nintendo.com': 'Nintendo',

    // Productivity & Storage
    'dropbox.com': 'Dropbox',
    'box.com': 'Box',
    'notion.so': 'Notion',
    'atlassian.com': 'Atlassian',
    'jira.com': 'Jira',
    'trello.com': 'Trello',
    'asana.com': 'Asana',
    'clickup.com': 'ClickUp',
    'monday.com': 'Monday.com',

    // Security & Identity
    'bitwarden.com': 'Bitwarden',
    '1password.com': '1Password',
    'lastpass.com': 'LastPass',
    'dashlane.com': 'Dashlane',
    'authy.com': 'Authy',

    // Shopping & Entertainment
    'amazon.com': 'Amazon',
    'netflix.com': 'Netflix',
    'spotify.com': 'Spotify',
    'apple.com': 'Apple',
    'ebay.com': 'eBay',
    'microsoft.com': 'Microsoft',
    'adobe.com': 'Adobe',

    // Web Hosting & Domains
    'cloudflare.com': 'Cloudflare',
    'godaddy.com': 'GoDaddy',
    'namecheap.com': 'Namecheap',
    'wordpress.com': 'WordPress',
    'shopify.com': 'Shopify',
    'wix.com': 'Wix'
};

interface SiteMeta {
    title: string;
    iconPath: string;
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

// Format domain name into a readable title
function formatDomainToTitle(domain: string): string {
    const basePart = domain.split('.')[0] || 'unknown';
    const words = basePart.split(/[-_]/);
    return words.map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
}

// Extract title from domain using known services dictionary or domain formatting
function extractTitleFromDomain(domain: string): string {
    // Check for known services first
    const knownService = KNOWN_SERVICES[domain];
    if (knownService) {
        return knownService;
    }

    // For subdomains of known services (e.g., pages.github.com)
    const parts = domain.split('.');
    if (parts.length > 2) {
        const parentDomain = parts.slice(-2).join('.');
        if (KNOWN_SERVICES[parentDomain]) {
            return KNOWN_SERVICES[parentDomain];
        }
    }

    return formatDomainToTitle(domain);
}

// Fetch site metadata
async function fetchSiteMeta(url: string): Promise<SiteMeta | undefined> {
    try {
        // Extract base domain
        const baseDomain = extractBaseDomain(url);
        const iconPath = `/api/metadata/icon?domain=${encodeURIComponent(baseDomain)}`;
        
        // First check known services
        const knownTitle = extractTitleFromDomain(baseDomain);

        // Try to fetch the website for title if not a known service
        if (!KNOWN_SERVICES[baseDomain]) {
            try {
                const response = await fetch(url);
                const html = await response.text();
                const dom = new JSDOM(html);
                const doc = dom.window.document;
                const pageTitle = doc.querySelector('title')?.textContent?.trim();
                
                if (pageTitle) {
                    return {
                        title: pageTitle,
                        iconPath,
                        baseDomain
                    };
                }
            } catch (fetchErr) {
                console.error('Failed to fetch website:', fetchErr);
            }
        }

        // Fallback to known service name or formatted domain
        return {
            title: knownTitle,
            iconPath,
            baseDomain
        };
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
                        iconPath: Type.String(),
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

    // Icon endpoint - proxies Google's favicon service with fallback to globe.svg
    server.get<RouteGenericFetchIcon>('/metadata/icon', {
        schema: {
            querystring: Type.Object({
                domain: Type.String(),
            }),
            security: [], // Empty security array means no authentication required
        },
    }, async (request, reply) => {
        const { domain } = request.query;
        const googleFaviconUrl = `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${encodeURIComponent(domain)}&size=128`;
        
        try {
            const response = await fetch(googleFaviconUrl);
            
            if (!response.ok) {
                // If Google's service fails, serve the fallback icon
                const globeSvg = `<svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g clip-path="url(#a)"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.27 14.1a6.5 6.5 0 0 0 3.67-3.45q-1.24.21-2.7.34-.31 1.83-.97 3.1M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.48-1.52a7 7 0 0 1-.96 0H7.5a4 4 0 0 1-.84-1.32q-.38-.89-.63-2.08a40 40 0 0 0 3.92 0q-.25 1.2-.63 2.08a4 4 0 0 1-.84 1.31zm2.94-4.76q1.66-.15 2.95-.43a7 7 0 0 0 0-2.58q-1.3-.27-2.95-.43a18 18 0 0 1 0 3.44m-1.27-3.54a17 17 0 0 1 0 3.64 39 39 0 0 1-4.3 0 17 17 0 0 1 0-3.64 39 39 0 0 1 4.3 0m1.1-1.17q1.45.13 2.69.34a6.5 6.5 0 0 0-3.67-3.44q.65 1.26.98 3.1M8.48 1.5l.01.02q.41.37.84 1.31.38.89.63 2.08a40 40 0 0 0-3.92 0q.25-1.2.63-2.08a4 4 0 0 1 .85-1.32 7 7 0 0 1 .96 0m-2.75.4a6.5 6.5 0 0 0-3.67 3.44 29 29 0 0 1 2.7-.34q.31-1.83.97-3.1M4.58 6.28q-1.66.16-2.95.43a7 7 0 0 0 0 2.58q1.3.27 2.95.43a18 18 0 0 1 0-3.44m.17 4.71q-1.45-.12-2.69-.34a6.5 6.5 0 0 0 3.67 3.44q-.65-1.27-.98-3.1" fill="#666"/></g><defs><clipPath id="a"><path fill="#fff" d="M0 0h16v16H0z"/></clipPath></defs></svg>`;
                
                reply
                    .header('Content-Type', 'image/svg+xml')
                    .header('Cache-Control', 'public, max-age=86400') // Cache for 24 hours
                    .header('Cross-Origin-Resource-Policy', 'cross-origin')
                    .header('Access-Control-Allow-Origin', '*')
                    .header('Access-Control-Allow-Methods', 'GET')
                    .send(globeSvg);
                return;
            }
            
            const contentType = response.headers.get('content-type');
            const iconData = await response.arrayBuffer();
            
            reply
                .header('Content-Type', contentType)
                .header('Cache-Control', 'public, max-age=86400') // Cache for 24 hours
                .header('Cross-Origin-Resource-Policy', 'cross-origin')
                .header('Access-Control-Allow-Origin', '*')
                .header('Access-Control-Allow-Methods', 'GET')
                .send(Buffer.from(iconData));
        } catch (err) {
            server.log.error('Failed to fetch icon:', err);
            
            // For any error, serve the fallback icon
            const globeSvg = `<svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g clip-path="url(#a)"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.27 14.1a6.5 6.5 0 0 0 3.67-3.45q-1.24.21-2.7.34-.31 1.83-.97 3.1M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.48-1.52a7 7 0 0 1-.96 0H7.5a4 4 0 0 1-.84-1.32q-.38-.89-.63-2.08a40 40 0 0 0 3.92 0q-.25 1.2-.63 2.08a4 4 0 0 1-.84 1.31zm2.94-4.76q1.66-.15 2.95-.43a7 7 0 0 0 0-2.58q-1.3-.27-2.95-.43a18 18 0 0 1 0 3.44m-1.27-3.54a17 17 0 0 1 0 3.64 39 39 0 0 1-4.3 0 17 17 0 0 1 0-3.64 39 39 0 0 1 4.3 0m1.1-1.17q1.45.13 2.69.34a6.5 6.5 0 0 0-3.67-3.44q.65 1.26.98 3.1M8.48 1.5l.01.02q.41.37.84 1.31.38.89.63 2.08a40 40 0 0 0-3.92 0q.25-1.2.63-2.08a4 4 0 0 1 .85-1.32 7 7 0 0 1 .96 0m-2.75.4a6.5 6.5 0 0 0-3.67 3.44 29 29 0 0 1 2.7-.34q.31-1.83.97-3.1M4.58 6.28q-1.66.16-2.95.43a7 7 0 0 0 0 2.58q1.3.27 2.95.43a18 18 0 0 1 0-3.44m.17 4.71q-1.45-.12-2.69-.34a6.5 6.5 0 0 0 3.67 3.44q-.65-1.27-.98-3.1" fill="#666"/></g><defs><clipPath id="a"><path fill="#fff" d="M0 0h16v16H0z"/></clipPath></defs></svg>`;
            
            reply
                .header('Content-Type', 'image/svg+xml')
                .header('Cache-Control', 'public, max-age=86400')
                .header('Cross-Origin-Resource-Policy', 'cross-origin')
                .header('Access-Control-Allow-Origin', '*')
                .header('Access-Control-Allow-Methods', 'GET')
                .send(globeSvg);
        }
    });
}
