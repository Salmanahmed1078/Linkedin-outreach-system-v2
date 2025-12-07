// Google Sheets data fetching utilities
// Reads from public Google Sheet (no credentials needed)
// 
// IMPORTANT: The Google Sheet must be publicly accessible (viewable by anyone with the link)
// To make a sheet public:
// 1. Open the Google Sheet
// 2. Click "Share" → "Change to anyone with the link"
// 3. Set permission to "Viewer"
//
// Usage in Server Components:
//   const data = await fetchDMSheetData();
//   const stats = calculateStats(data);
//
// Usage in Client Components (requires API route wrapper):
//   Create an API route at /api/dm-data that calls fetchDMSheetData()
//   Then use fetch('/api/dm-data') in your client component

import { DMEntry, ScrapedDataEntry, IndexEntry, DashboardStats, AnalyticsData, SendMessageEntry } from './types';

const SHEET_ID = '11GQ7hgeSR_5ZmBWBwfzWRLLO3jppfGSlqR2zBrIORHY';

/**
 * Fetch scraped data from a sheet by GID (Type 2 - Scraped Data Sheets)
 */
async function fetchScrapedDataSheet(gid: number, postTopic?: string, postUrl?: string): Promise<ScrapedDataEntry[]> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      console.log(`Sheet GID ${gid} returned status ${response.status}`);
      return [];
    }

    const csvText = await response.text();
    if (!csvText || csvText.trim().length === 0 || csvText.includes('<!DOCTYPE')) {
      console.log(`Sheet GID ${gid} returned empty or invalid response`);
      return [];
    }
    
    const rows = parseCSV(csvText);
    if (rows.length === 0 || rows.length === 1) {
      console.log(`Sheet GID ${gid} has no data rows`);
      return [];
    }

    const headers = rows[0];
    console.log(`Sheet GID ${gid} headers:`, headers.filter(h => h).map(h => h.trim()));
    
    // Check if this looks like a Scraped Data sheet
    // NEW FORMAT: Reduced fields - Only requires: First Name, Last Name, Profile URL, Linkedin Post
    // Optional fields: Company, Role, Headline, About, Engagement Type, Comment Text
    // Sheet names follow format: Post_Nov_13_2025_11_17_PM (runtime generated)
    // They do NOT have: DM column AND Approval column together (that's a DM sheet)
    
    // Normalize headers for easier checking
    const normalizedHeaders = headers.map(h => h ? h.toLowerCase().trim() : '');
    
    const hasFirstName = normalizedHeaders.some(h => h.includes('first name') || h === 'firstname' || h === 'first_name');
    const hasLastName = normalizedHeaders.some(h => h.includes('last name') || h === 'lastname' || h === 'last_name' || h.includes('surname'));
    const hasProfileUrl = normalizedHeaders.some(h => h.includes('profile url') || h.includes('profileurl') || h.includes('profile link') || h.includes('linkedin url'));
    const hasLinkedInPost = normalizedHeaders.some(h => h.includes('linkedin post') || h.includes('linkedin_post') || h.includes('post url'));
    const hasLinkedInPostUser = normalizedHeaders.some(h => h.includes('linkedin post user') || h.includes('post user'));
    
    // Optional fields (may or may not exist)
    const hasCompany = normalizedHeaders.some(h => h.includes('company') || h === 'comp');
    const hasRole = normalizedHeaders.some(h => h.includes('role') || h.includes('title') || h.includes('position'));
    const hasHeadline = normalizedHeaders.some(h => h.includes('headline') || h.includes('head line'));
    const hasEngagement = normalizedHeaders.some(h => h.includes('engagement'));
    const hasAbout = normalizedHeaders.some(h => h.includes('about') || h.includes('bio') || h.includes('summary'));
    
    // Check if it's a DM sheet (has both DM and Approval columns)
    const hasDM = normalizedHeaders.some(h => h.includes('dm') && !h.includes('profile'));
    const hasApproval = normalizedHeaders.some(h => h.includes('approval'));
    const isDMSheet = hasDM && hasApproval;
    
    // It's a scraped data sheet if it has core columns and is NOT a DM sheet
    // Core requirements: First Name or Last Name (at least one) and Profile URL or LinkedIn Post
    const hasCoreColumns = (hasFirstName || hasLastName) && (hasProfileUrl || hasLinkedInPost || hasLinkedInPostUser);
    
    if (isDMSheet) {
      console.log(`Sheet GID ${gid} is a DM sheet (has DM + Approval), skipping for scraped data`);
      return [];
    }
    
    if (!hasCoreColumns) {
      console.log(`Sheet GID ${gid} doesn't look like a scraped data sheet.`);
      console.log(`   Headers found: ${headers.filter(h => h).slice(0, 10).join(', ')}...`);
      console.log(`   Detected: firstName=${hasFirstName}, lastName=${hasLastName}, profileUrl=${hasProfileUrl}, linkedInPost=${hasLinkedInPost}, linkedInPostUser=${hasLinkedInPostUser}`);
      console.log(`   Optional: company=${hasCompany}, role=${hasRole}, headline=${hasHeadline}, engagement=${hasEngagement}, about=${hasAbout}`);
      return [];
    }
    
    console.log(`✓ Sheet GID ${gid} looks like a scraped data sheet!`);
    console.log(`   Core columns: firstName=${hasFirstName}, lastName=${hasLastName}, profileUrl=${hasProfileUrl}, linkedInPost=${hasLinkedInPost}`);
    console.log(`   Optional columns: company=${hasCompany}, role=${hasRole}, headline=${hasHeadline}, engagement=${hasEngagement}, about=${hasAbout}`);
    console.log(`   Parsing ${rows.length - 1} data rows...`);

    const entries: ScrapedDataEntry[] = [];
    let rowCounter = 1;
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(cell => !cell || cell.trim() === '')) continue;

      // Core required fields
      const firstName = getCell(row, headers, 'First Name') || '';
      const lastName = getCell(row, headers, 'Last Name') || '';
      const profileUrl = getCell(row, headers, 'Profile URL') || '';
      const linkedinPost = getCell(row, headers, 'Linkedin Post') || getCell(row, headers, 'LinkedIn Post') || postUrl || '';
      const linkedInPostUser = getCell(row, headers, 'LinkedIn Post User') || undefined;

      // Only accept entries with at least First Name or Last Name AND Profile URL or Linkedin Post
      if (!firstName && !lastName) continue; // Must have at least a name
      if (!profileUrl && !linkedinPost && !linkedInPostUser) continue; // Must have at least post or profile link

      // Optional fields - only include if they exist in the sheet
      let aboutValue: string | undefined = getCell(row, headers, 'About');
      if (!aboutValue || aboutValue.trim() === '') {
        const aboutHeaderIndex = headers.findIndex(h => 
          h && h.toLowerCase().trim().includes('about')
        );
        if (aboutHeaderIndex !== -1 && row[aboutHeaderIndex]) {
          aboutValue = row[aboutHeaderIndex].trim() || undefined;
        } else {
          aboutValue = undefined;
        }
      } else {
        aboutValue = aboutValue.trim() || undefined;
      }

      // Get engagement type if it exists
      let engagementType: 'Liked' | 'Commented' | undefined = undefined;
      const engagementValue = getCell(row, headers, 'Engagement Type') || getCell(row, headers, 'Engagement');
      if (engagementValue && engagementValue.trim()) {
        const normalized = engagementValue.trim().toLowerCase();
        if (normalized.includes('comment')) {
          engagementType = 'Commented';
        } else {
          engagementType = 'Liked';
        }
      }

      // Get optional fields only if they exist
      const company = getCell(row, headers, 'Company') || undefined;
      const role = getCell(row, headers, 'Role') || undefined;
      const headline = getCell(row, headers, 'Headline') || undefined;
      const commentText = getCell(row, headers, 'Comment Text') || getCell(row, headers, 'Comment') || undefined;

      const entry: ScrapedDataEntry = {
        rowId: rowCounter++,
        'LinkedIn Post User': linkedInPostUser,
        'Linkedin Post': linkedinPost,
        'First Name': firstName,
        'Last Name': lastName,
        'Profile URL': profileUrl,
        // Optional fields - only include if they have values
        Company: company && company.trim() ? company.trim() : undefined,
        Role: role && role.trim() ? role.trim() : undefined,
        Headline: headline && headline.trim() ? headline.trim() : undefined,
        About: aboutValue,
        'Engagement Type': engagementType,
        'Comment Text': commentText && commentText.trim() ? commentText.trim() : undefined,
        post_topic: postTopic,
        post_gid: gid,
      };

      entries.push(entry);
    }
    
    console.log(`Parsed ${entries.length} scraped entries from GID ${gid}`);
    return entries;
  } catch (error) {
    console.error(`Error fetching scraped data sheet GID ${gid}:`, error);
    return [];
  }
}

/**
 * Fetch DM data from a sheet by GID (Type 3 - DM Sheets)
 */
async function fetchDMDataSheet(gid: number, postTopic?: string, postUrl?: string): Promise<DMEntry[]> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) return [];

    const csvText = await response.text();
    if (!csvText || csvText.trim().length === 0 || csvText.includes('<!DOCTYPE')) {
      return [];
    }
    
    const rows = parseCSV(csvText);
    if (rows.length === 0 || rows.length === 1) return [];

    const headers = rows[0];
    
    // Check if this looks like a DM sheet (has DM and Approval columns)
    const hasDMColumns = headers.some(h => 
      h && h.toLowerCase().includes('dm')
    ) && headers.some(h => 
      h && h.toLowerCase().includes('approval')
    );

    if (!hasDMColumns) return [];

    const entries: DMEntry[] = [];
    let rowCounter = 1;
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(cell => !cell || cell.trim() === '')) continue;

      // Get About field
      let aboutValue = getCell(row, headers, 'About');
      if (!aboutValue || aboutValue.trim() === '') {
        const aboutHeaderIndex = headers.findIndex(h => 
          h && h.toLowerCase().trim().includes('about')
        );
        if (aboutHeaderIndex !== -1 && row[aboutHeaderIndex]) {
          aboutValue = row[aboutHeaderIndex].trim();
        }
      }

      const entry: DMEntry = {
        rowId: rowCounter++,
        'Linkedin Post': getCell(row, headers, 'Linkedin Post') || postUrl || '',
        'First Name': getCell(row, headers, 'First Name') || '',
        'Last Name': getCell(row, headers, 'Last Name') || '',
        Company: getCell(row, headers, 'Company') || '',
        Role: getCell(row, headers, 'Role') || '',
        Headline: getCell(row, headers, 'Headline') || '',
        About: aboutValue || '',
        DM: getCell(row, headers, 'DM') || '',
        Approval: (getCell(row, headers, 'Approval') || 'Pending Review') as DMEntry['Approval'],
        Feedback: getCell(row, headers, 'Feedback') || undefined,
        post_topic: postTopic,
      };

      if (entry['First Name'] || entry.DM) {
        entries.push(entry);
      }
    }

    return entries;
  } catch (error) {
    console.error(`Error fetching DM sheet GID ${gid}:`, error);
    return [];
  }
}

/**
 * Fetch data from a specific sheet by name or GID (Legacy function - kept for compatibility)
 */
async function fetchSheetByGidOrName(gidOrName: string | number): Promise<DMEntry[]> {
  try {
    // Try using GID first (for specific sheets)
    let url: string;
    if (typeof gidOrName === 'number') {
      url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gidOrName}`;
    } else {
      // Use sheet name
      url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(gidOrName)}`;
    }
    
    const response = await fetch(url, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return []; // Return empty array if sheet doesn't exist
    }

    const csvText = await response.text();
    
    // Check if we got an error page or empty response
    if (!csvText || csvText.trim().length === 0 || csvText.includes('<!DOCTYPE')) {
      return [];
    }
    
    // Parse CSV
    const rows = parseCSV(csvText);
    
    if (rows.length === 0 || rows.length === 1) {
      return []; // No data rows
    }

    // First row is headers - check if it looks like a DM sheet
    const headers = rows[0];
    const hasDMColumns = headers.some(h => 
      h && (
        h.toLowerCase().includes('first name') ||
        h.toLowerCase().includes('dm') ||
        h.toLowerCase().includes('approval') ||
        h.toLowerCase().includes('linkedin post')
      )
    );

    if (!hasDMColumns) {
      return []; // This doesn't look like a DM sheet
    }
    
    // Log headers for debugging
    console.log('Sheet headers found:', headers.map(h => h?.trim()).filter(Boolean));
    console.log('Looking for About column. Available columns with "about" in name:', 
      headers.filter(h => h && h.toLowerCase().includes('about')).map(h => h.trim())
    );
    
    // Convert to DMEntry objects
    const dmEntries: DMEntry[] = [];
    let rowCounter = 1;
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      // Skip empty rows
      if (!row || row.every(cell => !cell || cell.trim() === '')) {
        continue;
      }

      // Get About field with multiple fallback options
      // Try various common column names for About section
      let aboutValue = getCell(row, headers, 'About');
      if (!aboutValue || aboutValue.trim() === '') {
        aboutValue = getCell(row, headers, 'About Section');
      }
      if (!aboutValue || aboutValue.trim() === '') {
        aboutValue = getCell(row, headers, 'About Me');
      }
      if (!aboutValue || aboutValue.trim() === '') {
        aboutValue = getCell(row, headers, 'Bio');
      }
      if (!aboutValue || aboutValue.trim() === '') {
        aboutValue = getCell(row, headers, 'Summary');
      }
      if (!aboutValue || aboutValue.trim() === '') {
        aboutValue = getCell(row, headers, 'Description');
      }
      // Final fallback - check all headers for anything containing "about"
      if (!aboutValue || aboutValue.trim() === '') {
        const aboutHeaderIndex = headers.findIndex(h => 
          h && h.toLowerCase().trim().includes('about')
        );
        if (aboutHeaderIndex !== -1 && row[aboutHeaderIndex]) {
          aboutValue = row[aboutHeaderIndex].trim();
        }
      }
      aboutValue = aboutValue || '';

      const entry: DMEntry = {
        rowId: rowCounter++, // Use sequential counter as ID
        'Linkedin Post': getCell(row, headers, 'Linkedin Post') || '',
        'First Name': getCell(row, headers, 'First Name') || '',
        'Last Name': getCell(row, headers, 'Last Name') || '',
        Company: getCell(row, headers, 'Company') || '',
        Role: getCell(row, headers, 'Role') || '',
        Headline: getCell(row, headers, 'Headline') || '',
        About: aboutValue,
        DM: getCell(row, headers, 'DM') || '',
        Approval: (getCell(row, headers, 'Approval') || 'Pending Review') as DMEntry['Approval'],
        Feedback: getCell(row, headers, 'Feedback') || undefined,
        post_topic: getCell(row, headers, 'Post Topic') || undefined,
      };

      // Only add if it has at least a name or DM content
      if (entry['First Name'] || entry.DM) {
        dmEntries.push(entry);
      }
    }

    return dmEntries;
  } catch (error) {
    console.error(`Error fetching sheet ${gidOrName}:`, error);
    return []; // Return empty array on error
  }
}

/**
 * Extract GID from a Google Sheets URL
 * Handles both #gid= and &gid= patterns
 */
function extractGidFromUrl(url: string): number | null {
  try {
    if (!url || url.trim() === '') return null;
    
    // Try #gid= pattern first (most common in Sheet_Link)
    let gidMatch = url.match(/#gid=(\d+)/);
    if (gidMatch && gidMatch[1]) {
      const gid = parseInt(gidMatch[1], 10);
      console.log(`Extracted GID ${gid} from URL: ${url.substring(0, 80)}...`);
      return gid;
    }
    
    // Try &gid= pattern
    gidMatch = url.match(/&gid=(\d+)/);
    if (gidMatch && gidMatch[1]) {
      const gid = parseInt(gidMatch[1], 10);
      console.log(`Extracted GID ${gid} from URL: ${url.substring(0, 80)}...`);
      return gid;
    }
    
    console.log(`Could not extract GID from URL: ${url.substring(0, 80)}...`);
    return null;
  } catch (error) {
    console.error(`Error extracting GID from URL: ${url}`, error);
    return null;
  }
}

/**
 * Fetch all scraped data from all post sheets (Type 2)
 */
export async function fetchAllScrapedData(): Promise<ScrapedDataEntry[]> {
  try {
    const indexData = await fetchIndexSheetData();
    const allEntries: ScrapedDataEntry[] = [];
    
    console.log(`=== Fetching scraped data from ${indexData.length} posts ===`);
    
    if (indexData.length === 0) {
      console.warn('⚠️ No posts found in Index sheet!');
      return [];
    }
    
    for (const post of indexData) {
      if (post.gid) {
        try {
          console.log(`\n🔍 Fetching scraped data for post: "${post.postTopic || 'Unknown'}" (GID: ${post.gid})`);
          const entries = await fetchScrapedDataSheet(post.gid, post.postTopic, post.postUrl);
          if (entries.length > 0) {
            console.log(`✅ Found ${entries.length} scraped entries for post: "${post.postTopic || 'Unknown'}"`);
            allEntries.push(...entries);
          } else {
            console.log(`❌ No scraped entries found for post: "${post.postTopic || 'Unknown'}" (GID: ${post.gid})`);
            console.log(`   Sheet Link: ${post.sheetLink}`);
          }
        } catch (error) {
          console.error(`⚠️ Error fetching scraped data for GID ${post.gid}:`, error);
        }
      } else {
        console.log(`⚠️ Post "${post.postTopic || 'Unknown'}" has no GID, skipping`);
        console.log(`   Sheet Link: ${post.sheetLink}`);
        console.log(`   Post URL: ${post.postUrl}`);
      }
    }
    
    console.log(`\n📊 Total scraped entries found: ${allEntries.length}`);
    if (allEntries.length > 0) {
      const likedCount = allEntries.filter(e => e['Engagement Type'] === 'Liked').length;
      const commentedCount = allEntries.filter(e => e['Engagement Type'] === 'Commented').length;
      console.log(`   - Liked: ${likedCount}`);
      console.log(`   - Commented: ${commentedCount}`);
    }
    
    return allEntries;
  } catch (error) {
    console.error('❌ Error fetching all scraped data:', error);
    return [];
  }
}

/**
 * Fetch all DM data from "Combined Leads" sheet (Type 3)
 * Updated: Primary source is "Combined Leads" sheet which contains merged and deduplicated leads
 * This sheet contains leads data ready for Hyreach (DM generation)
 * Sheet name: "Combined Leads" (exact match, case-sensitive)
 */
export async function fetchAllDMData(): Promise<DMEntry[]> {
  try {
    const allEntries: DMEntry[] = [];
    const fetchedGids = new Set<number>();
    
    // Strategy 1: Fetch from "Combined Leads" sheet by GID (PRIMARY SOURCE)
    // The sheet at GID 1628119603 is the "Combined Leads" sheet
    const combinedLeadsGid = 1628119603;
    
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${combinedLeadsGid}`;
      const response = await fetch(url, { cache: 'no-store' });
      
      if (response.ok) {
        const csvText = await response.text();
        if (csvText && !csvText.includes('<!DOCTYPE')) {
          const rows = parseCSV(csvText);
          if (rows.length > 1) {
            const headers = rows[0];
            console.log(`Found "Combined Leads" sheet (GID: ${combinedLeadsGid}). Headers:`, headers.filter(h => h).map(h => h.trim()));
            
            // Check if it has required columns (First Name, Last Name, Profile URL, LinkedIn Post)
            const normalizedHeaders = headers.map(h => h ? h.toLowerCase().trim() : '');
            const hasFirstName = normalizedHeaders.some(h => h.includes('first name') || h === 'firstname' || h === 'first_name');
            const hasLastName = normalizedHeaders.some(h => h.includes('last name') || h === 'lastname' || h === 'last_name');
            const hasLinkedInPost = normalizedHeaders.some(h => h.includes('linkedin post') || h.includes('linkedin_post') || h.includes('post url'));
            const hasProfileUrl = normalizedHeaders.some(h => h.includes('profile url') || h.includes('profileurl') || h.includes('profile link'));
            
            // Parse entries - only get basic fields: LinkedIn Post, First Name, Last Name, Profile URL
            if (hasFirstName || hasLastName || hasLinkedInPost || hasProfileUrl) {
              const entries: DMEntry[] = [];
              let rowCounter = 1;
              
              for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.every(cell => !cell || cell.trim() === '')) continue;
                
                const firstName = getCell(row, headers, 'First Name') || '';
                const lastName = getCell(row, headers, 'Last Name') || '';
                const linkedinPost = getCell(row, headers, 'Linkedin Post') || getCell(row, headers, 'LinkedIn Post') || '';
                const profileUrl = getCell(row, headers, 'Profile URL') || '';
                
                // Skip empty rows
                if (!firstName && !lastName && !linkedinPost && !profileUrl) continue;
                
                const entry: DMEntry = {
                  rowId: rowCounter++,
                  'Linkedin Post': linkedinPost,
                  'First Name': firstName,
                  'Last Name': lastName,
                  'Profile URL': profileUrl,
                };
                
                // Add entry if it has at least a name or profile URL
                if (entry['First Name'] || entry['Last Name'] || entry['Profile URL']) {
                  entries.push(entry);
                }
              }
              
              if (entries.length > 0) {
                console.log(`✓ Found ${entries.length} entries in "Combined Leads" sheet (GID: ${combinedLeadsGid})`);
                allEntries.push(...entries);
                fetchedGids.add(combinedLeadsGid);
                // Return early if we found entries
                return allEntries;
              }
            } else {
              console.log(`"Combined Leads" sheet (GID: ${combinedLeadsGid}) doesn't have expected columns (First Name, Last Name, LinkedIn Post, or Profile URL)`);
            }
          }
        }
      } else {
        console.log(`"Combined Leads" sheet (GID: ${combinedLeadsGid}) returned status ${response.status}`);
      }
    } catch (error) {
      console.warn(`Error fetching "Combined Leads" sheet (GID: ${combinedLeadsGid}):`, error);
    }
    
    // Strategy 2: Try "Combined Leads" by sheet name (fallback)
    const combinedLeadsSheetName = 'Combined Leads';
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(combinedLeadsSheetName)}`;
      const response = await fetch(url, { cache: 'no-store' });
      
      if (response.ok) {
        const csvText = await response.text();
        if (csvText && !csvText.includes('<!DOCTYPE')) {
          const rows = parseCSV(csvText);
          if (rows.length > 1) {
            const headers = rows[0];
            const normalizedHeaders = headers.map(h => h ? h.toLowerCase().trim() : '');
            const hasFirstName = normalizedHeaders.some(h => h.includes('first name') || h === 'firstname' || h === 'first_name');
            const hasLastName = normalizedHeaders.some(h => h.includes('last name') || h === 'lastname' || h === 'last_name');
            
            if (hasFirstName || hasLastName) {
              const entries = await fetchDMDataSheet(combinedLeadsSheetName as any);
              if (entries.length > 0 && !fetchedGids.has(combinedLeadsGid)) {
                allEntries.push(...entries);
                fetchedGids.add(combinedLeadsGid);
              }
            }
          }
        }
      }
    } catch (error) {
      // Continue to next strategy
    }
    
    // Strategy 3: Fallback to other known DM sheet GIDs (from user's link) - keep as backup
    const indexData = await fetchIndexSheetData();
    const knownDMGids: number[] = [];
    
    for (const gid of knownDMGids) {
      if (fetchedGids.has(gid)) continue;
      try {
        const entries = await fetchDMDataSheet(gid);
        if (entries.length > 0) {
          console.log(`Found ${entries.length} DM entries in sheet GID: ${gid}`);
          allEntries.push(...entries);
          fetchedGids.add(gid);
        }
      } catch (error) {
        console.warn(`Error fetching DM sheet GID ${gid}:`, error);
      }
    }
    
    // If we found entries, return them
    if (allEntries.length > 0) {
      console.log(`Total DM entries found: ${allEntries.length}`);
      return allEntries;
    }
    
    // Strategy 2: Try common DM sheet names
    const dmSheetNames = ['DMs', 'DM', 'DM Messages', 'DM_Data'];
    for (const sheetName of dmSheetNames) {
      try {
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
        const response = await fetch(url, { cache: 'no-store' });
        
        if (response.ok) {
          const csvText = await response.text();
          if (csvText && !csvText.includes('<!DOCTYPE')) {
            const rows = parseCSV(csvText);
            if (rows.length > 1) {
              const headers = rows[0];
              // Check if it's a DM sheet
              const hasDMColumns = headers.some(h => 
                h && h.toLowerCase().includes('dm')
              ) && headers.some(h => 
                h && h.toLowerCase().includes('approval')
              );
              
              if (hasDMColumns) {
                // Parse as DM sheet
                const entries: DMEntry[] = [];
                let rowCounter = 1;
                
                for (let i = 1; i < rows.length; i++) {
                  const row = rows[i];
                  if (!row || row.every(cell => !cell || cell.trim() === '')) continue;
                  
                  let aboutValue = getCell(row, headers, 'About') || '';
                  if (!aboutValue) {
                    const aboutIdx = headers.findIndex(h => h && h.toLowerCase().includes('about'));
                    if (aboutIdx !== -1) aboutValue = row[aboutIdx]?.trim() || '';
                  }
                  
                  // Handle Approval checkbox
                  let approvalValue = getCell(row, headers, 'Approval') || '';
                  if (approvalValue.toUpperCase() === 'TRUE' || approvalValue === '1' || approvalValue === '✓') {
                    approvalValue = 'Approved';
                  } else if (approvalValue.toUpperCase() === 'FALSE' || approvalValue === '0' || approvalValue === '') {
                    approvalValue = 'Pending Review';
                  }
                  
                  const entry: DMEntry = {
                    rowId: rowCounter++,
                    'Linkedin Post': getCell(row, headers, 'Linkedin Post') || '',
                    'First Name': getCell(row, headers, 'First Name') || '',
                    'Last Name': getCell(row, headers, 'Last Name') || '',
                    Company: getCell(row, headers, 'Company') || '',
                    Role: getCell(row, headers, 'Role') || '',
                    Headline: getCell(row, headers, 'Headline') || '',
                    About: aboutValue,
                    DM: getCell(row, headers, 'DM') || '',
                    Approval: (approvalValue || 'Pending Review') as DMEntry['Approval'],
                    Feedback: getCell(row, headers, 'Feedback') || undefined,
                  };
                  
                  if (entry['First Name'] || entry.DM) {
                    entries.push(entry);
                  }
                }
                
                if (entries.length > 0) {
                  console.log(`Found ${entries.length} DM entries in sheet: ${sheetName}`);
                  allEntries.push(...entries);
                }
              }
            }
          }
        }
      } catch (error) {
        // Continue to next sheet name
      }
    }
    
    // Strategy 3: Check each post's sheet - some might be DM sheets
    // But be careful - most post sheets are scraped data, not DM
    // Only check if we haven't found many DM entries yet
    if (allEntries.length < 10) {
      for (const post of indexData) {
        if (post.gid && !fetchedGids.has(post.gid)) {
          try {
            const dmEntries = await fetchDMDataSheet(post.gid, post.postTopic, post.postUrl);
            if (dmEntries.length > 0) {
              console.log(`Found ${dmEntries.length} DM entries in post sheet GID: ${post.gid} (${post.postTopic || 'Unknown'})`);
              allEntries.push(...dmEntries);
              fetchedGids.add(post.gid);
            }
          } catch (error) {
            // Silently continue
          }
        }
      }
    }
    
    // Remove duplicates based on name + company + DM content
    const uniqueEntries = allEntries.filter((entry, index, self) => {
      const key = `${entry['First Name']}_${entry['Last Name']}_${entry.Company}_${entry.DM?.substring(0, 50) || ''}`;
      return index === self.findIndex(e => 
        `${e['First Name']}_${e['Last Name']}_${e.Company}_${e.DM?.substring(0, 50) || ''}` === key
      );
    });
    
    console.log(`Total unique DM entries found: ${uniqueEntries.length}`);
    return uniqueEntries;
  } catch (error) {
    console.error('Error fetching all DM data:', error);
    return [];
  }
}

/**
 * Fetch data from the DM sheet(s) - Legacy function for compatibility
 */
export async function fetchDMSheetData(): Promise<DMEntry[]> {
  return fetchAllDMData();
}

/**
 * Parse CSV text into 2D array
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentCell += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of cell
      currentRow.push(currentCell);
      currentCell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // End of row
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip \n in \r\n
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  // Add last cell and row if not empty
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Get cell value by column name (flexible matching)
 * Tries exact match first, then partial match, then variations
 */
function getCell(row: string[], headers: string[], columnName: string): string | null {
  const normalizedName = columnName.toLowerCase().trim();
  
  // First try exact match (case-insensitive)
  let index = headers.findIndex(h => 
    h && h.toLowerCase().trim() === normalizedName
  );
  
  // If not found, try partial match (contains the column name)
  if (index === -1) {
    index = headers.findIndex(h => {
      if (!h) return false;
      const normalizedHeader = h.toLowerCase().trim();
      return normalizedHeader.includes(normalizedName) || normalizedName.includes(normalizedHeader);
    });
  }
  
  // Special handling for common column name variations
  if (index === -1) {
    const variations: Record<string, string[]> = {
      'about': ['about section', 'about me', 'profile about', 'bio', 'summary', 'description', 'about_me', 'aboutsection'],
      'first name': ['firstname', 'first_name', 'fname', 'first name', 'firstname'],
      'last name': ['lastname', 'last_name', 'lname', 'surname', 'last name', 'lastname'],
      'linkedin post': ['linkedin_post', 'post url', 'post_url', 'linkedin url', 'linkedin post', 'posturl'],
      'linkedin post user': ['linkedin_post_user', 'post user', 'post_user', 'linkedin post user', 'postuser'],
      'engagement type': ['engagement_type', 'engagement', 'type', 'engagement type', 'engagementtype'],
      'comment text': ['comment_text', 'comment', 'comments', 'comment text', 'commenttext'],
      'profile url': ['profile_url', 'profile url', 'linkedin profile', 'profile link', 'profileurl', 'profile_link'],
      'post topic': ['post_topic', 'topic', 'post topic', 'posttopic'],
      'company': ['company', 'comp', 'organization', 'org', 'organisation'],
      'role': ['role', 'title', 'position', 'job title', 'job_title', 'jobtitle'],
      'headline': ['headline', 'head line', 'head_line', 'headline'],
      'post_url': ['post_url', 'post url', 'posturl', 'linkedin post url'],
      'sheet_link': ['sheet_link', 'sheet link', 'sheetlink'],
    };
    
    const variationsList = variations[normalizedName] || [];
    for (const variation of variationsList) {
      index = headers.findIndex(h => {
        if (!h) return false;
        const normalizedHeader = h.toLowerCase().trim();
        // Try exact match first
        if (normalizedHeader === variation) return true;
        // Then try partial match
        return normalizedHeader.includes(variation) || variation.includes(normalizedHeader);
      });
      if (index !== -1) break;
    }
  }
  
  if (index === -1) return null;
  const value = row[index];
  return value ? value.trim() : null;
}

/**
 * Calculate comprehensive dashboard statistics
 */
export function calculateStats(
  indexEntries: IndexEntry[],
  scrapedEntries: ScrapedDataEntry[],
  dmEntries: DMEntry[]
): DashboardStats {
  // Index stats
  const totalPosts = indexEntries.length;
  
  // Scraped data stats
  const totalScraped = scrapedEntries.length;
  
  // Engagement type stats (optional field - may not exist in new format)
  const entriesWithEngagement = scrapedEntries.filter(e => e['Engagement Type']);
  const totalLiked = entriesWithEngagement.filter(e => e['Engagement Type'] === 'Liked').length;
  const totalCommented = entriesWithEngagement.filter(e => e['Engagement Type'] === 'Commented').length;
  
  // Unique companies and roles (optional fields - may not exist in new format)
  const entriesWithCompany = scrapedEntries.filter(e => e.Company && e.Company.trim() !== '');
  const companies = new Set(entriesWithCompany.map(e => e.Company!.trim()));
  const uniqueCompanies = companies.size;
  
  const entriesWithRole = scrapedEntries.filter(e => e.Role && e.Role.trim() !== '');
  const roles = new Set(entriesWithRole.map(e => e.Role!.trim()));
  const uniqueRoles = Array.from(roles);
  
  // Top companies (only if data exists)
  const companyCounts = new Map<string, number>();
  entriesWithCompany.forEach(e => {
    const company = e.Company!.trim();
    companyCounts.set(company, (companyCounts.get(company) || 0) + 1);
  });
  const topCompanies = Array.from(companyCounts.entries())
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  // Top roles (only if data exists)
  const roleCounts = new Map<string, number>();
  entriesWithRole.forEach(e => {
    const role = e.Role!.trim();
    roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
  });
  const topRoles = Array.from(roleCounts.entries())
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  // Combined Leads stats
  const totalLeads = dmEntries.length;
  
  // Engagement rate (commented / total scraped)
  const engagementRate = totalScraped > 0 ? (totalCommented / totalScraped) * 100 : 0;

  return {
    totalPosts,
    totalScraped,
    totalLiked,
    totalCommented,
    uniqueCompanies,
    uniqueRoles,
    totalLeads,
    engagementRate: Math.round(engagementRate * 10) / 10,
    topCompanies,
    topRoles,
  };
}

/**
 * Generate analytics data for charts
 */
export function generateAnalyticsData(
  indexEntries: IndexEntry[],
  scrapedEntries: ScrapedDataEntry[],
  dmEntries: DMEntry[]
): AnalyticsData {
  // Posts over time (simplified - using post order as time proxy)
  const postsOverTime = indexEntries.map((post, index) => ({
    date: `Post ${index + 1}`,
    count: index + 1,
  }));
  
  // Engagement breakdown with percentages (optional field - may not exist in new format)
  const entriesWithEngagement = scrapedEntries.filter(e => e['Engagement Type']);
  const totalEngagement = entriesWithEngagement.length;
  const likedCount = entriesWithEngagement.filter(e => e['Engagement Type'] === 'Liked').length;
  const commentedCount = entriesWithEngagement.filter(e => e['Engagement Type'] === 'Commented').length;
  
  // Only show engagement breakdown if we have engagement data
  const engagementBreakdown = totalEngagement > 0 ? [
    { 
      type: 'Liked', 
      count: likedCount,
      percentage: totalEngagement > 0 ? Math.round((likedCount / totalEngagement) * 100) : 0
    },
    { 
      type: 'Commented', 
      count: commentedCount,
      percentage: totalEngagement > 0 ? Math.round((commentedCount / totalEngagement) * 100) : 0
    },
  ] : [];
  
  // Approval status removed - no longer needed for Combined Leads
  
  // Company distribution (top 10)
  const companyCounts = new Map<string, number>();
  scrapedEntries.forEach(e => {
    if (e.Company && e.Company.trim() !== '') {
      companyCounts.set(e.Company, (companyCounts.get(e.Company) || 0) + 1);
    }
  });
  const companyDistribution = Array.from(companyCounts.entries())
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  // Role distribution (top 10)
  const roleCounts = new Map<string, number>();
  scrapedEntries.forEach(e => {
    if (e.Role && e.Role.trim() !== '') {
      roleCounts.set(e.Role, (roleCounts.get(e.Role) || 0) + 1);
    }
  });
  const roleDistribution = Array.from(roleCounts.entries())
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    postsOverTime,
    engagementBreakdown,
    companyDistribution,
    roleDistribution,
  };
}

/**
 * Fetch index sheet data (list of posts) - Type 1 Sheet
 */
export async function fetchIndexSheetData(): Promise<IndexEntry[]> {
  try {
    // Try different possible names for the Index sheet
    const possibleNames = ['Index', 'IndexSheet1', 'Posts', 'Post Index'];
    const INDEX_GID = 585392388; // Known GID for Index sheet
    
    // Try GID first
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${INDEX_GID}`;
      const response = await fetch(url, { cache: 'no-store' });
      
      if (response.ok) {
        const csvText = await response.text();
        if (csvText && csvText.trim().length > 0 && !csvText.includes('<!DOCTYPE')) {
          const rows = parseCSV(csvText);
          if (rows.length > 1) {
            const indexData = parseIndexSheet(rows);
            if (indexData.length > 0) {
              console.log(`Found ${indexData.length} posts in Index sheet (GID: ${INDEX_GID})`);
              return indexData;
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Error fetching Index sheet by GID:`, error);
    }
    
    // Fallback to sheet names
    for (const sheetName of possibleNames) {
      try {
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
        const response = await fetch(url, { cache: 'no-store' });

        if (!response.ok) continue;

        const csvText = await response.text();
        if (!csvText || csvText.trim().length === 0 || csvText.includes('<!DOCTYPE')) {
          continue;
        }
        
        const rows = parseCSV(csvText);
        if (rows.length === 0 || rows.length === 1) continue;

        const indexData = parseIndexSheet(rows);
        if (indexData.length > 0) {
          console.log(`Found ${indexData.length} posts in Index sheet: ${sheetName}`);
          return indexData;
        }
      } catch (error) {
        console.warn(`Error fetching Index sheet with name ${sheetName}:`, error);
        continue;
      }
    }

    return [];
  } catch (error) {
    console.error('Error fetching index data:', error);
    return [];
  }
}

/**
 * Parse Index sheet rows into IndexEntry objects
 */
function parseIndexSheet(rows: string[][]): IndexEntry[] {
  const headers = rows[0];
  const indexData: IndexEntry[] = [];
  
  console.log('Parsing Index sheet with headers:', headers.filter(h => h).map(h => h.trim()));
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(cell => !cell || cell.trim() === '')) continue;

    const postUrl = getCell(row, headers, 'Post_URL') || getCell(row, headers, 'Post URL') || getCell(row, headers, 'Post_URL') || '';
    const sheetLink = getCell(row, headers, 'Sheet_Link') || getCell(row, headers, 'Sheet Link') || getCell(row, headers, 'Sheet_Link') || '';
    const postTopic = getCell(row, headers, 'Post Topic') || getCell(row, headers, 'PostTopic') || getCell(row, headers, 'Post_Topic') || '';

    if (postUrl || sheetLink) {
      const gid = extractGidFromUrl(sheetLink);
      console.log(`Index entry: Topic="${postTopic}", URL="${postUrl.substring(0, 50)}...", SheetLink="${sheetLink.substring(0, 50)}...", GID=${gid}`);
      indexData.push({
        postUrl,
        sheetLink,
        postTopic,
        gid: gid || undefined,
      });
    } else {
      console.log(`Skipping row ${i} - no Post_URL or Sheet_Link`);
    }
  }
  
  console.log(`Parsed ${indexData.length} posts from Index sheet`);
  return indexData;
}

/**
 * Fetch data from Send_Message sheet
 * Sheet contains messages awaiting approval with fields:
 * - Linkedin Post, First Name, Last Name, Profile URL, Headline, Company, Approval
 */
export async function fetchSendMessageData(): Promise<SendMessageEntry[]> {
  try {
    const sheetName = 'Send_Message';
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      console.log(`Send_Message sheet returned status ${response.status}`);
      return [];
    }

    const csvText = await response.text();
    if (!csvText || csvText.trim().length === 0 || csvText.includes('<!DOCTYPE')) {
      console.log(`Send_Message sheet returned empty or invalid response`);
      return [];
    }

    const rows = parseCSV(csvText);
    if (rows.length === 0 || rows.length === 1) {
      console.log(`Send_Message sheet has no data rows`);
      return [];
    }

    const headers = rows[0];
    console.log(`Send_Message sheet headers:`, headers.filter(h => h).map(h => h.trim()));

    const entries: SendMessageEntry[] = [];
    let rowCounter = 1;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(cell => !cell || cell.trim() === '')) continue;

      const linkedinPost = getCell(row, headers, 'Linkedin Post') || getCell(row, headers, 'LinkedIn Post') || '';
      const firstName = getCell(row, headers, 'First Name') || '';
      const lastName = getCell(row, headers, 'Last Name') || '';
      const profileUrl = getCell(row, headers, 'Profile URL') || '';
      const headline = getCell(row, headers, 'Headline') || undefined;
      const company = getCell(row, headers, 'Company') || undefined;
      
      // Get approval status - normalize to lowercase and handle variations
      // Default is 'approval' if not set
      let approvalValue = getCell(row, headers, 'Approval') || 'approval';
      approvalValue = approvalValue.trim().toLowerCase();
      
      // Normalize approval values - only three options: approval, reject, sent
      let approval: SendMessageEntry['Approval'] = 'approval'; // default
      if (approvalValue === 'approve' || approvalValue === 'approved' || approvalValue === 'approval') {
        approval = 'approval';
      } else if (approvalValue === 'reject' || approvalValue === 'rejected') {
        approval = 'reject';
      } else if (approvalValue === 'sent') {
        approval = 'sent';
      } else {
        // Default to approval if value is not recognized
        approval = 'approval';
      }

      // Only add entries with at least a name or profile URL
      if (firstName || lastName || profileUrl) {
        entries.push({
          rowId: rowCounter++,
          'Linkedin Post': linkedinPost,
          'First Name': firstName,
          'Last Name': lastName,
          'Profile URL': profileUrl,
          Headline: headline && headline.trim() ? headline.trim() : undefined,
          Company: company && company.trim() ? company.trim() : undefined,
          Approval: approval,
        });
      }
    }

    console.log(`Parsed ${entries.length} entries from Send_Message sheet`);
    return entries;
  } catch (error) {
    console.error('Error fetching Send_Message sheet data:', error);
    return [];
  }
}

