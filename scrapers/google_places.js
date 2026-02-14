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

// Check if a website exists and is functional
async function checkWebsite(url) {
  if (!url) return { exists: false, quality: 'none' };
  
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? require('https') : require('http');
    const req = protocol.get(url, { timeout: 5000 }, (res) => {
      // If we get a response, site exists
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve({ exists: true, quality: 'has-site', url });
      } else {
        resolve({ exists: false, quality: 'broken', url });
      }
    });
    req.on('error', () => resolve({ exists: false, quality: 'broken', url }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ exists: false, quality: 'timeout', url });
    });
  });
}

// Main scrape function
async function scrapeBusinesses(category, location, limit = 20, options = {}) {
  const { noWebsiteOnly = false } = options;
  
  console.log(`🔍 Searching for ${category} in ${location}...`);
  if (noWebsiteOnly) console.log(`🎯 Filtering: Only businesses WITHOUT websites`);
  
  const results = await searchPlaces(category, location);
  console.log(`📍 Found ${results.length} results`);
  
  const businesses = [];
  const skipped = { hasWebsite: [], failed: [] };
  let processed = 0;
  
  for (let i = 0; i < results.length && businesses.length < limit; i++) {
    const place = results[i];
    processed++;
    console.log(`📋 Checking ${place.name} (${processed}/${results.length})...`);
    
    try {
      const details = await getPlaceDetails(place.place_id);
      
      // Check if they have a website
      if (noWebsiteOnly && details.website) {
        const webCheck = await checkWebsite(details.website);
        if (webCheck.exists) {
          console.log(`  ⏭️  SKIP: Has working website (${details.website})`);
          skipped.hasWebsite.push({ name: details.name, website: details.website });
          continue;
        } else {
          console.log(`  ⚠️  Listed site broken/down: ${details.website}`);
        }
      }
      
      const business = {
        id: place.place_id,
        name: details.name,
        address: details.formatted_address,
        phone: details.formatted_phone_number || null,
        website: details.website || null,
        hasWorkingWebsite: false,
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
      
      console.log(`  ✅ ADDED: No website found - good prospect!`);
      businesses.push(business);
      
      // Small delay to be nice to the API
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`  ⚠️ Failed to get details for ${place.name}: ${err.message}`);
      skipped.failed.push({ name: place.name, error: err.message });
    }
  }
  
  // Summary
  console.log(`\n📊 Summary:`);
  console.log(`   Checked: ${processed}`);
  console.log(`   Good prospects (no site): ${businesses.length}`);
  console.log(`   Skipped (has website): ${skipped.hasWebsite.length}`);
  console.log(`   Failed: ${skipped.failed.length}`);
  
  return { businesses, skipped };
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  
  // Parse flags
  const noWebsiteOnly = args.includes('--no-website');
  const filteredArgs = args.filter(a => !a.startsWith('--'));
  
  const category = filteredArgs[0] || config.default_category;
  const location = filteredArgs[1] || config.default_location;
  const limit = parseInt(filteredArgs[2]) || 20;
  
  console.log(`\n🚀 LocalSite Scraper`);
  console.log(`   Category: ${category}`);
  console.log(`   Location: ${location}`);
  console.log(`   Limit: ${limit}`);
  console.log(`   Filter: ${noWebsiteOnly ? 'NO WEBSITE ONLY ✓' : 'All businesses'}\n`);
  
  try {
    const result = await scrapeBusinesses(category, location, limit, { noWebsiteOnly });
    const businesses = result.businesses || result;
    
    // Save to data folder
    const suffix = noWebsiteOnly ? '_NO_SITE' : '';
    const filename = `${category.replace(/\s+/g, '_')}_${location.replace(/[,\s]+/g, '_')}${suffix}_${Date.now()}.json`;
    const filepath = path.join(__dirname, '..', 'data', filename);
    
    fs.writeFileSync(filepath, JSON.stringify(businesses, null, 2));
    console.log(`\n✅ Saved ${businesses.length} prospects to ${filename}`);
    
    // Print prospects
    if (businesses.length > 0) {
      console.log('\n🎯 Good Prospects (no website):');
      businesses.forEach(b => {
        const hasPhone = b.phone ? '📞' : '  ';
        const rating = b.rating ? `⭐${b.rating}` : '    ';
        console.log(`  ${hasPhone} ${rating} ${b.name}`);
      });
    }
    
    return businesses;
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

module.exports = { scrapeBusinesses, searchPlaces, getPlaceDetails, checkWebsite };

if (require.main === module) {
  main();
}
