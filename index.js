
'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

const API_NAME = 'PORNHUB PUBLIC VIDEO SCRAPER';
const CREATOR = 'MIYORA API';
const MAX_SIZE = 50 * 1024 * 1024;

const client = axios.create({
    timeout: 20000,
    maxRedirects: 3,
    maxContentLength: MAX_SIZE,
    headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': '*/*'
    }
});

function validUrl(value) {
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}

function allowedHost(host) {
    return (process.env.ALLOWED_MEDIA_HOSTS || '')
        .split(',')
        .map(x => x.trim().toLowerCase())
        .includes(host.toLowerCase());
}

function safeName(value) {
    return String(value || 'video.mp4')
        .replace(/[^\w.-]/g, '_')
        .slice(0, 100);
}

async function handler(req, res) {
    const pathname = new URL(
        req.url,
        'https://localhost'
    ).pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({
            status: false,
            message: 'Method not allowed'
        });
    }

    if (pathname === '/' || pathname === '/api') {
        return res.json({
            status: true,
            name: API_NAME,
            creator: CREATOR,
            version: '1.0.0',
            quality: ['240p', '360p', '720p'],
            endpoints: [
                '/api/health',
                '/api/info?url=PAGE_URL',
                '/api/download?url=MEDIA_URL'
            ]
        });
    }

    if (pathname === '/api/health') {
        return res.json({
            status: true,
            name: API_NAME,
            creator: CREATOR,
            online: true,
            uptime: process.uptime()
        });
    }

    if (pathname === '/api/info') {
        try {
            const url = req.query.url;

            if (!url || !validUrl(url)) {
                return res.status(400).json({
                    status: false,
                    message: 'Invalid HTTPS URL'
                });
            }

            const response = await client.get(url, {
                responseType: 'text',
                maxContentLength: 5 * 1024 * 1024
            });

            const $ = cheerio.load(response.data);

            return res.json({
                status: true,
                creator: CREATOR,
                result: {
                    title:
                        $('meta[property="og:title"]').attr('content') ||
                        $('title').text().trim(),
                    thumbnail:
                        $('meta[property="og:image"]').attr('content') || null,
                    description:
                        $('meta[property="og:description"]').attr('content') || '',
                    pageUrl: url
                }
            });

        } catch {
            return res.status(500).json({
                status: false,
                message: 'Metadata extraction failed'
            });
        }
    }

    if (pathname === '/api/download') {
        try {
            const url = req.query.url;

            if (!url || !validUrl(url)) {
                return res.status(400).json({
                    status: false,
                    message: 'Invalid media URL'
                });
            }

            const parsed = new URL(url);

            if (!allowedHost(parsed.hostname)) {
                return res.status(403).json({
                    status: false,
                    message: 'Media host not allowed'
                });
            }

            const response = await client.get(url, {
                responseType: 'arraybuffer',
                maxContentLength: MAX_SIZE
            });

            const type = response.headers['content-type'] || '';

            if (
                !type.startsWith('video/') &&
                !type.startsWith('audio/') &&
                !type.includes('octet-stream')
            ) {
                return res.status(415).json({
                    status: false,
                    message: 'Media file not found'
                });
            }

            const data = Buffer.from(response.data);

            res.setHeader('Content-Type', type);
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${safeName(req.query.name)}"`
            );
            res.setHeader('Content-Length', data.length);
            res.setHeader('Cache-Control', 'no-store');

            return res.status(200).send(data);

        } catch {
            return res.status(500).json({
                status: false,
                message: 'Download failed'
            });
        }
    }

    return res.status(404).json({
        status: false,
        name: API_NAME,
        message: 'Endpoint not found'
    });
}

module.exports = handler;
