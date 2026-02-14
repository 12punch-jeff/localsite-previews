#!/usr/bin/env node
/**
 * Site Generator
 * Takes scraped business data and generates sites from templates
 */

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const SITES_DIR = path.join(__dirname, '..', 'sites');
const DATA_DIR = path.join(__dirname, '..', 'data');

// Generate stars HTML
function generateStars(rating) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  let html = '';
  for (let i = 0; i < fullStars; i++) html += '★';
  if (hasHalf) html += '½';
  for (let i = fullStars + (hasHalf ? 1 : 0); i < 5; i++) html += '☆';
  return html;
}

// Generate review HTML
function generateReviewsHtml(reviews) {
  if (!reviews || reviews.length === 0) return '';
  
  return reviews.slice(0, 3).map(r => `
    <div class="review-card">
      <div class="review-header">
        <span class="review-stars">${generateStars(r.rating)}</span>
      </div>
      <p class="review-text">"${r.text.slice(0, 250)}${r.text.length > 250 ? '...' : ''}"</p>
      <p class="review-author">— ${r.author}</p>
    </div>
  `).join('\n');
}

// Generate hours HTML
function generateHoursHtml(hours) {
  if (!hours || hours.length === 0) return '';
  
  return hours.map(h => {
    const [day, time] = h.split(': ');
    return `<li><span>${day}</span><span>${time || 'Closed'}</span></li>`;
  }).join('\n');
}

// Generate slug from business name
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

// Extract city from address
function extractCity(address) {
  if (!address) return 'your area';
  const match = address.match(/,\s*([^,]+),\s*[A-Z]{2}/);
  return match ? match[1].trim() : 'your area';
}

// Generate taglines by category
const taglines = {
  plumber: [
    "Fast, reliable service you can trust. Available 24/7 for emergencies.",
    "Professional plumbing solutions for your home and business.",
    "Quality workmanship and honest pricing. Serving the community for years."
  ],
  landscaper: [
    "Professional landscaping that transforms your outdoor space into something extraordinary.",
    "From design to installation, we create stunning landscapes that last.",
    "Your vision, our expertise. Beautiful outdoor spaces start here.",
    "Quality craftsmanship and attention to detail in every project."
  ],
  handyman: [
    "No job too small. Fast, reliable repairs you can count on.",
    "Your one-call solution for home repairs and improvements.",
    "Honest work, fair prices. Getting things done right the first time.",
    "From honey-do lists to major fixes — we handle it all."
  ],
  'house cleaner': [
    "Professional cleaning that makes your home sparkle.",
    "Reliable, thorough cleaning services you can trust.",
    "A clean home is a happy home. Let us help."
  ],
  'pressure washing': [
    "Restore your property's curb appeal with professional pressure washing.",
    "Powerful cleaning that makes surfaces look new again.",
    "Expert pressure washing for homes and businesses."
  ],
  default: [
    "Professional service you can trust. Serving the local community.",
    "Quality work at fair prices. Call us today for a free estimate.",
    "Your local experts. Reliable, professional, and ready to help."
  ]
};

// Get tagline for category
function getTagline(category) {
  const cat = category.toLowerCase();
  const list = taglines[cat] || taglines.default;
  return list[Math.floor(Math.random() * list.length)];
}

// Get template name for category
function getTemplateName(category) {
  const cat = category.toLowerCase();
  if (cat.includes('landscap') || cat.includes('lawn')) return 'landscaper';
  if (cat.includes('handyman') || cat.includes('repair')) return 'handyman';
  if (cat.includes('plumb')) return 'plumber';
  if (cat.includes('clean') || cat.includes('maid')) return 'handyman'; // Use handyman style for cleaners
  if (cat.includes('pressure') || cat.includes('wash')) return 'landscaper'; // Use landscaper style for pressure washing
  return 'plumber'; // Default
}

// Generate site from template
function generateSite(business, templateNameOverride = null) {
  const templateName = templateNameOverride || getTemplateName(business.category || 'default');
  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.html`);
  
  // Check if template exists, fallback to plumber
  let template;
  if (fs.existsSync(templatePath)) {
    template = fs.readFileSync(templatePath, 'utf-8');
  } else {
    template = fs.readFileSync(path.join(TEMPLATES_DIR, 'plumber.html'), 'utf-8');
  }
  
  const slug = generateSlug(business.name);
  const city = extractCity(business.address);
  const tagline = getTagline(business.category || 'default');
  const activateUrl = `https://cornershopdigital.com/activate/${slug}`;
  
  // Build replacements
  const replacements = {
    '{{BUSINESS_NAME}}': business.name,
    '{{PHONE}}': business.phone || '',
    '{{ADDRESS}}': business.address || '',
    '{{CITY}}': city,
    '{{RATING}}': business.rating || '',
    '{{REVIEW_COUNT}}': business.reviewCount || '0',
    '{{STARS_HTML}}': business.rating ? generateStars(business.rating) : '',
    '{{REVIEWS_HTML}}': generateReviewsHtml(business.reviews),
    '{{HOURS_HTML}}': generateHoursHtml(business.hours),
    '{{GOOGLE_MAPS_URL}}': business.googleMapsUrl || '#',
    '{{WEBSITE}}': business.website || '',
    '{{TAGLINE}}': tagline,
    '{{ACTIVATE_URL}}': activateUrl,
    '{{YEAR}}': new Date().getFullYear().toString()
  };
  
  // Apply replacements
  for (const [key, value] of Object.entries(replacements)) {
    template = template.split(key).join(value);
  }
  
  // Handle conditionals
  // {{#PHONE}}...{{/PHONE}}
  if (business.phone) {
    template = template.replace(/\{\{#PHONE\}\}/g, '').replace(/\{\{\/PHONE\}\}/g, '');
  } else {
    template = template.replace(/\{\{#PHONE\}\}[\s\S]*?\{\{\/PHONE\}\}/g, '');
  }
  
  // {{#RATING}}...{{/RATING}}
  if (business.rating) {
    template = template.replace(/\{\{#RATING\}\}/g, '').replace(/\{\{\/RATING\}\}/g, '');
  } else {
    template = template.replace(/\{\{#RATING\}\}[\s\S]*?\{\{\/RATING\}\}/g, '');
  }
  
  // {{#HAS_REVIEWS}}...{{/HAS_REVIEWS}}
  if (business.reviews && business.reviews.length > 0) {
    template = template.replace(/\{\{#HAS_REVIEWS\}\}/g, '').replace(/\{\{\/HAS_REVIEWS\}\}/g, '');
  } else {
    template = template.replace(/\{\{#HAS_REVIEWS\}\}[\s\S]*?\{\{\/HAS_REVIEWS\}\}/g, '');
  }
  
  // {{#HAS_HOURS}}...{{/HAS_HOURS}}
  if (business.hours && business.hours.length > 0) {
    template = template.replace(/\{\{#HAS_HOURS\}\}/g, '').replace(/\{\{\/HAS_HOURS\}\}/g, '');
  } else {
    template = template.replace(/\{\{#HAS_HOURS\}\}[\s\S]*?\{\{\/HAS_HOURS\}\}/g, '');
  }
  
  return { html: template, slug, business };
}

// Generate all sites from a data file
function generateFromDataFile(dataFile) {
  const dataPath = path.join(DATA_DIR, dataFile);
  const businesses = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  
  console.log(`📄 Loaded ${businesses.length} businesses from ${dataFile}`);
  
  const generated = [];
  
  for (const business of businesses) {
    try {
      const { html, slug } = generateSite(business);
      
      // Create site directory
      const siteDir = path.join(SITES_DIR, slug);
      if (!fs.existsSync(siteDir)) {
        fs.mkdirSync(siteDir, { recursive: true });
      }
      
      // Write HTML
      fs.writeFileSync(path.join(siteDir, 'index.html'), html);
      
      // Write business data for reference
      fs.writeFileSync(path.join(siteDir, 'data.json'), JSON.stringify(business, null, 2));
      
      generated.push({
        name: business.name,
        slug,
        phone: business.phone,
        rating: business.rating,
        path: siteDir
      });
      
      console.log(`  ✅ Generated: ${slug}/`);
    } catch (err) {
      console.error(`  ❌ Failed: ${business.name} - ${err.message}`);
    }
  }
  
  // Write manifest
  const manifest = {
    generated_at: new Date().toISOString(),
    source: dataFile,
    sites: generated
  };
  fs.writeFileSync(path.join(SITES_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  
  console.log(`\n🎉 Generated ${generated.length} sites!`);
  console.log(`📁 Sites saved to: ${SITES_DIR}/`);
  
  return generated;
}

// CLI
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Find most recent data file
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    if (files.length === 0) {
      console.error('❌ No data files found. Run the scraper first.');
      process.exit(1);
    }
    generateFromDataFile(files[0]);
  } else {
    generateFromDataFile(args[0]);
  }
}

module.exports = { generateSite, generateFromDataFile };

if (require.main === module) {
  main();
}
