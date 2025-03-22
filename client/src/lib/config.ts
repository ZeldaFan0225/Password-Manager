// Utility to get API base URL from environment variables
export function getApiBaseUrl() {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
}
