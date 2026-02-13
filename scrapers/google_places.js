#!/usr/bin/env node
/**
 * Google Places Scraper
 * Pulls local business data for site generation
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const config = require('../config.json');
const API_KEY = config.google_places_api_key;

// Search for businesses
async function searchPlaces(query, location) {
  const textQuery = `${query} in ${location}`;
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(textQuery)}&key=${API_KEY}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'OK') {
            resolve(json.results);
          } else {
            reject(new Error(`Places API error: ${json.status} - ${json.error_message || ''}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Get detailed info for a place
async function getPlaceDetails(placeId) {
  const fields = 'name,formatted_address,formatted_phone_number,website,opening_hours,rating,reviews,photos,types,url';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${API_KEY}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'OK') {
            resolve(json.result);
          } else {
            reject(new Error(`Place Details error: ${json.status}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Generate photo URL
function getPhotoUrl(photoReference, maxWidth = 800) {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${API_KEY}`;
}

// Main scrape function
async function scrapeBusinesses(category, location, limit = 20) {
  console.log(`🔍 Searching for ${category} in ${location}...`);
  
  const results = await searchPlaces(category, location);
  console.log(`📍 Found ${results.length} results`);
  
  const businesses = [];
  const toProcess = results.slice(0, limit);
  
  for (let i = 0; i < toProcess.length; i++) {
    const place = toProcess[i];
    console.log(`📋 Getting details for ${place.name} (${i + 1}/${toProcess.length})...`);
    
    try {
      const details = await getPlaceDetails(place.place_id);
      
      const business = {
        id: place.place_id,
        name: details.name,
        address: details.formatted_address,
        phone: details.formatted_phone_number || null,
        website: details.website || null,
        rating: details.rating || null,
        reviewCount: details.reviews?.length || 0,
        reviews: (details.reviews || []).slice(0, 5).map(r => ({
          author: r.author_name,
          rating: r.rating,
          text: r.text,
          time: r.relative_time_description
        })),
        hours: details.opening_hours?.weekday_text || null,
        photos: (details.photos || []).slice(0, 5).map(p => ({
          url: getPhotoUrl(p.photo_reference),
          attribution: p.html_attributions?.[0] || null
        })),
        googleMapsUrl: details.url,
        types: details.types || [],
        category: category,
        location: location,
        scrapedAt: new Date().toISOString()
      };
      
      businesses.push(business);
      
      // Small delay to be nice to the API
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`  ⚠️ Failed to get details for ${place.name}: ${err.message}`);
    }
  }
  
  return businesses;
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const category = args[0] || config.default_category;
  const location = args[1] || config.default_location;
  const limit = parseInt(args[2]) || 20;
  
  try {
    const businesses = await scrapeBusinesses(category, location, limit);
    
    // Save to data folder
    const filename = `${category.replace(/\s+/g, '_')}_${location.replace(/[,\s]+/g, '_')}_${Date.now()}.json`;
    const filepath = path.join(__dirname, '..', 'data', filename);
    
    fs.writeFileSync(filepath, JSON.stringify(businesses, null, 2));
    console.log(`\n✅ Saved ${businesses.length} businesses to ${filename}`);
    
    // Print summary
    console.log('\n📊 Summary:');
    businesses.forEach(b => {
      const hasPhone = b.phone ? '📞' : '  ';
      const hasWebsite = b.website ? '🌐' : '  ';
      const rating = b.rating ? `⭐${b.rating}` : '    ';
      console.log(`  ${hasPhone}${hasWebsite} ${rating} ${b.name}`);
    });
    
    return businesses;
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

module.exports = { scrapeBusinesses, searchPlaces, getPlaceDetails };

if (require.main === module) {
  main();
}
