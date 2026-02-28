const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

// Endpoint Latest (yang sudah berhasil)
app.get('/api/anime/latest', async (req, res) => {
  try {
    const page = req.query.page || 1;
    const url = `https://cors.caliph.my.id/https://v1.samehadaku.how/anime-terbaru/page/${page}/`;
    
    console.log('Fetching latest:', url);
    
    const response = await axios.get(url, { headers });
    const $ = cheerio.load(response.data);
    
    const animeList = [];
    
    $('.post-show ul li').each((_, element) => {
      const titleElement = $(element).find('.dtla h2 a');
      const title = titleElement.text().trim();
      
      if (!title) return;
      
      animeList.push({
        title: title,
        url: titleElement.attr('href'),
        image: $(element).find('.thumb img').attr('src'),
        episode: $(element).find('.dtla span:contains("Episode")').text().replace('Episode', '').trim(),
        author: $(element).find('.dtla span:contains("Posted by") author').text().trim() || 'N/A',
        release: $(element).find('.dtla span:contains("Released on")').text().replace('Released on:', '').trim() || 'N/A'
      });
    });
    
    // Ambil info pagination
    const paginationText = $('.pagination').text();
    const totalPages = paginationText.match(/Page\s+\d+\s+of\s+(\d+)/i);
    
    res.json({
      success: true,
      data: animeList,
      pagination: {
        current: parseInt(page),
        total: parseInt(totalPages?.[1]) || 1
      },
      total: animeList.length
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ================ ENDPOINT SEARCH (Fix) ================
app.get('/api/anime/search', async (req, res) => {
  try {
    const query = req.query.q;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Parameter "q" (query) wajib diisi'
      });
    }
    
    // PAKAI FORMAT YANG SAMA PERSIS DENGAN KODE BERHASIL
    const url = `https://cors.caliph.my.id/https://v1.samehadaku.how/?s=${encodeURIComponent(query)}`;
    
    console.log('Search URL:', url);
    
    const response = await axios.get(url, { headers });
    const $ = cheerio.load(response.data);
    
    const searchResults = [];
    
    // PAKAI SELECTOR YANG SAMA: .animpost
    $('.animpost').each((_, element) => {
      // PAKAI STRUKTUR YANG SAMA: .data .title h2
      const title = $(element).find('.data .title h2').text().trim();
      
      if (!title) return;
      
      searchResults.push({
        title: title,
        url: $(element).find('a').attr('href'),
        image: $(element).find('.content-thumb img').attr('src'),
        type: $(element).find('.type').text().trim() || 'N/A',
        score: $(element).find('.score').text().trim() || 'N/A',
        // status: $(element).find('.status').text().trim() || 'N/A' // optional
      });
    });
    
    res.json({
      success: true,
      query: query,
      data: searchResults,
      total: searchResults.length
    });
    
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ================ ENDPOINT SCHEDULE ================
// ================ ENDPOINT SCHEDULE (FIX) ================
app.get('/api/anime/schedule', async (req, res) => {
  try {
    const day = req.query.day || 'monday';
    
    // Validasi day
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (!validDays.includes(day)) {
      return res.status(400).json({
        success: false,
        error: 'Parameter "day" tidak valid'
      });
    }
    
    // Panggil API internal mereka
    const url = `https://cors.caliph.my.id/https://v1.samehadaku.how/wp-json/custom/v1/all-schedule?perpage=50`;
    
    console.log('Fetching schedule API:', url);
    
    const response = await axios.get(url, { 
      headers: {
        ...headers,
        'Referer': 'https://v1.samehadaku.how/jadwal-rilis/'
      }
    });
    
    // Response dari API mereka langsung dalam format JSON
    const scheduleData = response.data;
    
    // Filter berdasarkan day yang diminta
    const filteredSchedule = scheduleData.filter(item => item.day === day);
    
    // Format ulang response
    const formattedSchedule = filteredSchedule.map(item => ({
      title: item.title,
      url: item.url,
      image: item.featured_img_src,
      type: item.east_type || 'N/A',
      score: item.east_score || 'N/A',
      genre: item.genre || 'N/A',
      time: item.east_time || 'N/A',
      day: item.day
    }));
    
    res.json({
      success: true,
      day: day,
      data: formattedSchedule,
      total: formattedSchedule.length
    });
    
  } catch (error) {
    console.error('Schedule error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint buat lihat semua schedule (opsional)
app.get('/api/anime/schedule/all', async (req, res) => {
  try {
    const url = `https://cors.caliph.my.id/https://v1.samehadaku.how/wp-json/custom/v1/all-schedule?perpage=100`;
    
    const response = await axios.get(url, { 
      headers: {
        ...headers,
        'Referer': 'https://v1.samehadaku.how/jadwal-rilis/'
      }
    });
    
    // Group by day
    const grouped = {};
    response.data.forEach(item => {
      if (!grouped[item.day]) {
        grouped[item.day] = [];
      }
      grouped[item.day].push({
        title: item.title,
        url: item.url,
        image: item.featured_img_src,
        type: item.east_type || 'N/A',
        score: item.east_score || 'N/A',
        genre: item.genre || 'N/A',
        time: item.east_time || 'N/A'
      });
    });
    
    res.json({
      success: true,
      data: grouped
    });
    
  } catch (error) {
    console.error('Schedule all error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ================ ENDPOINT SCHEDULE BY DAY ================
app.get('/api/anime/schedule/:day', async (req, res) => {
  try {
    const day = req.params.day;
    
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (!validDays.includes(day)) {
      return res.status(400).json({
        success: false,
        error: 'Day tidak valid. Pilih: monday, tuesday, wednesday, thursday, friday, saturday, sunday'
      });
    }
    
    // Redirect ke endpoint utama dengan parameter day
    req.query.day = day;
    return app._router.handle(req, res);
    
  } catch (error) {
    console.error('Schedule error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Samehadaku API',
    endpoints: {
      latest_anime: '/api/anime/latest',
      latest_with_page: '/api/anime/latest?page=2',
      search: '/api/anime/search?q=naruto',
      search_with_page: '/api/anime/search/page/2?q=naruto'
    },
    example: {
      search_bleach: '/api/anime/search?q=bleach',
      search_one_piece: '/api/anime/search?q=one%20piece'
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Try search: http://localhost:${PORT}/api/anime/search?q=naruto`);
});