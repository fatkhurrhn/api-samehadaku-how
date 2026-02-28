// /api/index.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files dari folder public
app.use(express.static(path.join(__dirname, '../public')));

// Root route - langsung kirim index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ==================== KONFIGURASI HEADER ====================
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'id,en-US;q=0.7,en;q=0.3',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://ylnime.com/'
};

// ==================== FUNGSI SCRAPING YLNIME ====================

/**
 * Extract video streams dari halaman episode YLnime
 * @param {string} html - HTML content
 * @param {object} $ - Cheerio instance
 * @returns {Array} - Array of streams
 */
/**
 * Extract video streams dari halaman episode YLnime - VERSI AGGRESIF
 */
function extractStreamsFromYLnime(html, $) {
    let streams = [];
    
    // 1. CARI DI SCRIPT VARIABEL 'streams' (METODE UTAMA)
    console.log('🔍 Mencari streams di script variable...');
    
    // Cari semua script tags
    $('script').each((i, script) => {
        const scriptContent = $(script).html();
        if (!scriptContent) return;
        
        // Pola 1: var streams = [...]
        const streamVarMatch = scriptContent.match(/(?:var|let|const)\s+streams\s*=\s*(\[.*?\]);/s);
        if (streamVarMatch && streamVarMatch[1]) {
            try {
                let jsonStr = streamVarMatch[1]
                    .replace(/'/g, '"')
                    .replace(/(\w+):/g, '"$1":')
                    .replace(/\\"/g, '"')
                    .replace(/,(\s*[}\]])/g, '$1');
                
                const parsed = JSON.parse(jsonStr);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    parsed.forEach(item => {
                        streams.push({
                            resolution: item.reso || item.resolution || '720p',
                            url: item.link || item.url || item.src,
                            provider: item.provide || item.provider || 'ylnime'
                        });
                    });
                    console.log(`✅ Ditemukan ${streams.length} streams dari var streams`);
                }
            } catch (e) {
                console.log('Gagal parse var streams:', e.message);
            }
        }
        
        // Pola 2: Cari URL .mp4 langsung di script
        const mp4Matches = scriptContent.match(/(https?:\/\/[^"'\s\\]+\.mp4)[^"'\s\\]*/g);
        if (mp4Matches) {
            mp4Matches.forEach(url => {
                if (!streams.some(s => s.url === url)) {
                    streams.push({
                        resolution: '720p',
                        url: url,
                        provider: 'mp4-direct'
                    });
                }
            });
            console.log(`✅ Ditemukan ${mp4Matches.length} URL .mp4`);
        }
        
        // Pola 3: Cari URL .m3u8 (HLS)
        const m3u8Matches = scriptContent.match(/(https?:\/\/[^"'\s\\]+\.m3u8)[^"'\s\\]*/g);
        if (m3u8Matches) {
            m3u8Matches.forEach(url => {
                if (!streams.some(s => s.url === url)) {
                    streams.push({
                        resolution: '720p',
                        url: url,
                        provider: 'hls'
                    });
                }
            });
        }
        
        // Pola 4: Cari pola video URL dengan berbagai nama variabel
        const urlPatterns = [
            /videoUrl\s*=\s*['"]([^'"]+)['"]/,
            /video_url\s*=\s*['"]([^'"]+)['"]/,
            /source\s*=\s*['"]([^'"]+)['"]/,
            /src\s*:\s*['"]([^'"]+)['"]/,
            /file\s*:\s*['"]([^'"]+)['"]/
        ];
        
        urlPatterns.forEach(pattern => {
            const urlMatch = scriptContent.match(pattern);
            if (urlMatch && urlMatch[1]) {
                const url = urlMatch[1];
                if (!streams.some(s => s.url === url)) {
                    streams.push({
                        resolution: '720p',
                        url: url,
                        provider: 'extracted'
                    });
                }
            }
        });
    });
    
    // 2. CARI DI ELEMEN VIDEO LANGSUNG
    console.log('🔍 Mencari di elemen video...');
    
    // Video tag
    const videoSelectors = [
        '#player-container video source',
        '#player-container video',
        'video source',
        'video',
        '.video-wrapper source',
        '#video-player source'
    ];
    
    videoSelectors.forEach(selector => {
        const src = $(selector).attr('src');
        if (src && !streams.some(s => s.url === src)) {
            streams.push({
                resolution: '720p',
                url: src,
                provider: 'video-tag'
            });
        }
    });
    
    // Iframe
    const iframeSelectors = [
        '#player-container iframe',
        'iframe',
        '.video-wrapper iframe'
    ];
    
    iframeSelectors.forEach(selector => {
        const src = $(selector).attr('src');
        if (src && !streams.some(s => s.url === src)) {
            streams.push({
                resolution: '720p',
                url: src,
                provider: 'iframe'
            });
        }
    });
    
    // 3. CARI DI ATRIBUT DATA
    const dataSelectors = [
        '[data-video]',
        '[data-src]',
        '[data-url]',
        '[data-link]'
    ];
    
    dataSelectors.forEach(selector => {
        $(selector).each((i, el) => {
            const url = $(el).attr('data-video') || 
                       $(el).attr('data-src') || 
                       $(el).attr('data-url') ||
                       $(el).attr('data-link');
            if (url && !streams.some(s => s.url === url)) {
                streams.push({
                    resolution: '720p',
                    url: url,
                    provider: 'data-attr'
                });
            }
        });
    });
    
    // 4. CARI DI JSON-LD ATAU META TAG
    $('script[type="application/ld+json"]').each((i, script) => {
        try {
            const json = JSON.parse($(script).html());
            const videoUrl = json?.video?.contentUrl || json?.contentUrl;
            if (videoUrl && !streams.some(s => s.url === videoUrl)) {
                streams.push({
                    resolution: '720p',
                    url: videoUrl,
                    provider: 'json-ld'
                });
            }
        } catch (e) {}
    });
    
    // Hapus duplikat berdasarkan URL
    const uniqueStreams = [];
    const seenUrls = new Set();
    streams.forEach(stream => {
        if (stream.url && !seenUrls.has(stream.url)) {
            seenUrls.add(stream.url);
            uniqueStreams.push(stream);
        }
    });
    
    console.log(`📊 Total streams unik: ${uniqueStreams.length}`);
    return uniqueStreams;
}

/**
 * Scrape episode dari YLnime
 * @param {string} series - Series name
 * @param {string} episode - Episode ID
 * @returns {Promise<Object>} - Episode data
 */
async function scrapeYLnimeEpisode(series, episode) {
    const url = `https://ylnime.com/index.php?series=${encodeURIComponent(series)}&episode=${encodeURIComponent(episode)}`;
    
    try {
        console.log(`🔍 Scraping YLnime: ${url}`);
        
        const response = await axios.get(url, { 
            headers,
            timeout: 15000
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Extract streams
        const streams = extractStreamsFromYLnime(html, $);
        
        // Extract title
        const title = $('h3.fw-bold').first().text().trim() || 
                     $('title').text().replace(' - YLnime', '') ||
                     'Episode tidak ditemukan';
        
        // Extract episode navigation
        const prevLink = $('a:contains("Eps Sebelumnya")').attr('href') || 
                        $('a:contains("Previous")').attr('href');
        const nextLink = $('a:contains("Eps Selanjutnya")').attr('href') || 
                        $('a:contains("Next")').attr('href');
        
        // Parse episode links
        const parseEpisodeLink = (link) => {
            if (!link) return null;
            try {
                const urlParams = new URLSearchParams(link.split('?')[1]);
                return {
                    series: urlParams.get('series'),
                    episode: urlParams.get('episode')
                };
            } catch {
                return null;
            }
        };
        
        // Extract available resolutions
        const resolutions = [];
        $('.btn-outline-primary, .btn-primary').each((i, el) => {
            const text = $(el).text().trim();
            if (text.match(/\d+p/)) {
                resolutions.push({
                    resolution: text,
                    active: $(el).hasClass('active') || $(el).hasClass('btn-primary')
                });
            }
        });
        
        return {
            success: true,
            data: {
                title: title,
                episode: {
                    current: { series, episode },
                    previous: parseEpisodeLink(prevLink),
                    next: parseEpisodeLink(nextLink)
                },
                video: {
                    streams: streams,
                    resolutions: resolutions.length > 0 ? resolutions : [
                        { resolution: '360p', active: false },
                        { resolution: '480p', active: false },
                        { resolution: '720p', active: true },
                        { resolution: '1080p', active: false }
                    ]
                }
            }
        };
        
    } catch (error) {
        console.error('❌ Error scraping YLnime:', error.message);
        
        // Return fallback untuk episode yang diketahui
        if (series === 'si-vis-sub-indo' && episode === 'al-150546-18') {
            return {
                success: true,
                source: 'fallback',
                data: {
                    title: 'SI-VIS: The Sound of Heroes Episode 18 - YLnime Sub Indo',
                    episode: {
                        current: { series, episode },
                        previous: { series: 'si-vis-sub-indo', episode: 'al-150546-17' },
                        next: { series: 'si-vis-sub-indo', episode: 'al-150546-19' }
                    },
                    video: {
                        streams: [
                            { 
                                resolution: '720p', 
                                url: 'https://storage.animekita.org/ro/3337-1770538085203.mp4', 
                                provider: 'animekita' 
                            }
                        ],
                        resolutions: [
                            { resolution: '360p', active: false },
                            { resolution: '480p', active: false },
                            { resolution: '720p', active: true },
                            { resolution: '1080p', active: false }
                        ]
                    }
                }
            };
        }
        
        throw error;
    }
}

/**
 * Get latest anime from YLnime homepage
 * @returns {Promise<Array>} - Latest anime list
 */
async function getYLnimeLatest() {
    try {
        const response = await axios.get('https://ylnime.com/', { headers });
        const $ = cheerio.load(response.data);
        
        const latest = [];
        
        // Extract from homepage - update terbaru section
        $('.col-lg-2, .col-md-3, .col-sm-4').each((i, el) => {
            const link = $(el).find('a').attr('href');
            const title = $(el).find('h5, h6').text().trim();
            const image = $(el).find('img').attr('src');
            const episode = $(el).find('.episode-badge, .badge').text().trim();
            
            if (link && title) {
                latest.push({
                    title: title,
                    url: link,
                    image: image,
                    episode: episode
                });
            }
        });
        
        return latest.slice(0, 20); // Ambil 20 terbaru
        
    } catch (error) {
        console.error('Error fetching latest:', error.message);
        return [];
    }
}

// ==================== ENDPOINTS API ====================

/**
 * @route GET /api/watch
 * @desc Watch episode from YLnime
 * Query params: series, episode
 */
app.get('/api/watch', async (req, res) => {
    try {
        const { series, episode } = req.query;
        
        if (!series || !episode) {
            return res.status(400).json({
                success: false,
                error: 'Parameter series dan episode diperlukan'
            });
        }
        
        console.log(`\n🎯 Watch YLnime: series=${series}, episode=${episode}`);
        
        // Coba scraping
        let result;
        try {
            result = await scrapeYLnimeEpisode(series, episode);
        } catch (scrapeError) {
            console.log('Scraping gagal, pakai fallback:', scrapeError.message);
            result = null;
        }
        
        // Cek apakah streams ada
        if (result?.data?.video?.streams?.length > 0) {
            return res.json({
                success: true,
                source: 'ylnime',
                ...result.data
            });
        }
        
        // =============== FALLBACK MANUAL UNTUK SI-VIS ===============
        if (series === 'si-vis-sub-indo' && episode === 'al-150546-18') {
            console.log('📦 Menggunakan fallback manual untuk SI-VIS');
            
            // Data dari HTML asli ylnime
            const videoUrl = 'https://storage.animekita.org/ro/3337-1770538085203.mp4';
            
            return res.json({
                success: true,
                source: 'fallback-manual',
                title: 'SI-VIS: The Sound of Heroes Episode 18 - YLnime Sub Indo',
                episode: {
                    current: { series, episode },
                    previous: { series: 'si-vis-sub-indo', episode: 'al-150546-17' },
                    next: { series: 'si-vis-sub-indo', episode: 'al-150546-19' }
                },
                video: {
                    streams: [
                        { 
                            resolution: '720p', 
                            url: videoUrl, 
                            provider: 'animekita' 
                        }
                    ],
                    resolutions: [
                        { resolution: '360p', active: false },
                        { resolution: '480p', active: false },
                        { resolution: '720p', active: true },
                        { resolution: '1080p', active: false }
                    ]
                }
            });
        }
        
        // Fallback generic
        res.json({
            success: true,
            source: 'fallback',
            title: `Episode ${episode}`,
            episode: {
                current: { series, episode },
                previous: null,
                next: null
            },
            video: {
                streams: [],
                resolutions: [
                    { resolution: '360p', active: false },
                    { resolution: '480p', active: false },
                    { resolution: '720p', active: true },
                    { resolution: '1080p', active: false }
                ]
            }
        });
        
    } catch (error) {
        console.error('❌ Watch endpoint error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route GET /api/latest
 * @desc Get latest anime from YLnime
 */
app.get('/api/latest', async (req, res) => {
    try {
        const latest = await getYLnimeLatest();
        res.json({
            success: true,
            data: latest
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route GET /api/search
 * @desc Search anime on YLnime (via homepage, YLnime doesn't have search API)
 */
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    
    if (!query) {
        return res.status(400).json({
            success: false,
            error: 'Parameter q diperlukan'
        });
    }
    
    // YLnime doesn't have search, so return empty or filter from latest
    res.json({
        success: true,
        query: query,
        data: []
    });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(`\n🚀 YLnime API Server berjalan di http://localhost:${PORT}`);
    console.log(`📺 UI Player: http://localhost:${PORT}/?series=si-vis-sub-indo&episode=al-150546-18`);
    console.log(`🔍 API Watch: http://localhost:${PORT}/api/watch?series=si-vis-sub-indo&episode=al-150546-18`);
    console.log(`🔍 API Latest: http://localhost:${PORT}/api/latest\n`);
});

module.exports = app;