'use strict';

const https = require('https');
const url = require('url');

// Target URLs
const SDK_BASE_URL = 'https://sdk.privacy-center.org';
const API_BASE_URL = 'https://api.privacy-center.org';

// Didomi file patterns to support (after /consent/ prefix)
const DIDOMI_PATTERNS = [
    // Accept ALL requests to sdk.privacy-center.org (as recommended by Didomi)
    // This ensures we don't miss any files when they update their SDK structure
    /^\/.*$/,
    
    // API patterns
    /^\/api\/.*$/
];

function isDidomiRequest(pathAfterConsent) {
    console.log(`Checking if path matches Didomi patterns: ${pathAfterConsent}`);
    for (let i = 0; i < DIDOMI_PATTERNS.length; i++) {
        const pattern = DIDOMI_PATTERNS[i];
        const matches = pattern.test(pathAfterConsent);
        console.log(`Pattern ${i}: ${pattern.source} - matches: ${matches}`);
        if (matches) {
            return true;
        }
    }
    return false;
}

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const uri = request.uri;
    
    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
        return {
            status: '200',
            statusDescription: 'OK',
            headers: {
                'access-control-allow-origin': [{ key: 'Access-Control-Allow-Origin', value: '*' }],
                'access-control-allow-methods': [{ key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' }],
                'access-control-allow-headers': [{ key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Requested-With' }]
            },
            body: ''
        };
    }
    
    // Extract path after /consent/
    if (!uri.startsWith('/consent/')) {
        return { status: '404', statusDescription: 'Not Found', body: 'Not Found' };
    }
    
    const pathAfterConsent = uri.substring(8); // Remove '/consent/'
    
    // Simple routing based on path prefix
    if (pathAfterConsent.startsWith('api/')) {
        // Remove /consent/api/ prefix → keep the rest
        const apiPath = pathAfterConsent.substring(4); // Remove 'api/'
        request.uri = `/${apiPath}`;
    } else {
        // All other paths go to SDK (maintains compatibility)
        request.uri = `/${pathAfterConsent}`;
    }
    
    return request;
};

function proxyRequest(targetUrl, method, originalRequest) {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(targetUrl);
        
        // Prepare headers
        const headers = {};
        
        // Copy headers from original request (except cookies)
        if (originalRequest.headers) {
            Object.keys(originalRequest.headers).forEach(key => {
                const header = originalRequest.headers[key];
                if (header && header.length > 0 && key.toLowerCase() !== 'cookie') {
                    headers[key] = header[0].value;
                }
            });
        }
        
        // Set required headers
        if (originalRequest.clientIp) {
            headers['X-Forwarded-For'] = originalRequest.clientIp;
        }
        headers['Host'] = parsedUrl.hostname;
        
        // Avoid compression issues
        headers['accept-encoding'] = 'identity';
        
        // Add cache headers for conditional requests (If-Modified-Since, If-None-Match)
        // These will be handled by CloudFront cache behavior
        
        // Add CloudFront headers for geo-based caching
        if (originalRequest.headers['cloudfront-viewer-country']) {
            headers['X-CloudFront-Country'] = originalRequest.headers['cloudfront-viewer-country'][0].value;
        }
        if (originalRequest.headers['cloudfront-viewer-region']) {
            headers['X-CloudFront-Region'] = originalRequest.headers['cloudfront-viewer-region'][0].value;
        }
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + (parsedUrl.search || ''),
            method: method,
            headers: headers,
            timeout: 10000 // 10 second timeout
        };
        
        console.log(`Making request to: ${targetUrl}`);
        console.log(`Request options:`, JSON.stringify(options, null, 2));
        
        const req = https.request(options, (res) => {
            console.log(`Received response: ${res.statusCode} ${res.statusMessage}`);
            console.log(`Response headers:`, JSON.stringify(res.headers, null, 2));
            
            let body = '';
            
            res.on('data', (chunk) => {
                body += chunk;
            });
            
            res.on('end', () => {
                console.log(`Response body length: ${body.length}`);
                
                // Copy response headers
                const responseHeaders = {};
                const allowedHeaders = [
                    'cache-control',
                    'content-language',
                    'content-type',
                    'content-length',
                    'expires',
                    'last-modified',
                    'pragma',
                    'set-cookie',
                    'vary',
                    // CORS headers
                    'access-control-allow-origin',
                    'access-control-allow-methods',
                    'access-control-allow-headers'
                ];
                Object.keys(res.headers).forEach(key => {
                    const value = res.headers[key];
                    if (value && allowedHeaders.includes(key.toLowerCase())) {
                        responseHeaders[key.toLowerCase()] = [{
                            key: key,
                            value: value
                        }];
                    }
                });
                
                // Add CORS headers for all responses
                responseHeaders['access-control-allow-origin'] = [{
                    key: 'Access-Control-Allow-Origin',
                    value: '*'
                }];
                
                responseHeaders['access-control-allow-methods'] = [{
                    key: 'Access-Control-Allow-Methods',
                    value: 'GET, POST, PUT, DELETE, OPTIONS'
                }];
                
                responseHeaders['access-control-allow-headers'] = [{
                    key: 'Access-Control-Allow-Headers',
                    value: 'Content-Type, Authorization, X-Requested-With'
                }];
                
                // Add content-length header if not present
                if (!responseHeaders['content-length'] && body) {
                    responseHeaders['content-length'] = [{
                        key: 'Content-Length',
                        value: Buffer.byteLength(body, 'utf8').toString()
                    }];
                }
                
                resolve({
                    status: res.statusCode.toString(),
                    statusDescription: res.statusMessage,
                    headers: responseHeaders,
                    body: body
                });
            });
        });
        
        req.on('error', (error) => {
            console.error('Request error:', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                stack: error.stack
            });
            reject(error);
        });
        
        req.on('timeout', () => {
            console.error('Request timeout after 10 seconds');
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        // Handle request body with proper decoding
        if (originalRequest.body) {
            let body;
            if (originalRequest.body.data) {
                body = Buffer.from(originalRequest.body.data, originalRequest.body.encoding || 'base64').toString();
            } else if (typeof originalRequest.body === 'string') {
                body = originalRequest.body;
            } else {
                body = JSON.stringify(originalRequest.body);
            }
            
            if (body) {
                req.write(body);
            }
        }
        
        req.end();
    });
} 