// Type definitions for ChatWalrus

// Index Sheet (Main Sheet) - Lists all posts
export interface IndexEntry {
  postUrl: string;
  sheetLink: string;
  postTopic: string;
  gid?: number; // Extracted from sheetLink
}

// Scraped Data Sheet - Profile data from LinkedIn scraping
// Updated: Reduced fields - Only core fields are required
// Sheet format: Post_Nov_13_2025_11_17_PM (runtime generated)
export interface ScrapedDataEntry {
  rowId: number;
  'LinkedIn Post User'?: string;
  'Linkedin Post': string;
  'First Name': string;
  'Last Name': string;
  'Profile URL': string;
  // Optional fields (may not exist in new format)
  Company?: string;
  Role?: string;
  Headline?: string;
  About?: string;
  'Engagement Type'?: 'Liked' | 'Commented';
  'Comment Text'?: string;
  post_topic?: string;
  post_gid?: number; // GID of the post sheet
}

// Combined Leads Sheet - Simple lead data (no DM or approval functionality)
export interface DMEntry {
  rowId: number;
  'Linkedin Post': string;
  'First Name': string;
  'Last Name': string;
  'Profile URL': string;
  post_topic?: string;
}

// Send Message Sheet - Messages awaiting approval
export interface SendMessageEntry {
  rowId: number;
  'Linkedin Post': string;
  'First Name': string;
  'Last Name': string;
  'Profile URL': string;
  Headline?: string;
  Company?: string;
  Approval: 'approval' | 'reject' | 'sent';
}

// Combined stats for dashboard
export interface DashboardStats {
  // Index stats
  totalPosts: number;
  
  // Scraped data stats
  totalScraped: number;
  totalLiked: number;
  totalCommented: number;
  uniqueCompanies: number;
  uniqueRoles: string[];
  
  // Combined Leads stats
  totalLeads: number;
  
  // Engagement stats
  engagementRate: number; // commented / total scraped
  topCompanies: Array<{ company: string; count: number }>;
  topRoles: Array<{ role: string; count: number }>;
}

// ApprovalAction removed - no longer needed for Combined Leads

// Analytics data for charts
export interface AnalyticsData {
  postsOverTime: Array<{ date: string; count: number }>;
  engagementBreakdown: Array<{ type: string; count: number; percentage: number }>;
  // approvalStatus removed - no longer needed
  companyDistribution: Array<{ company: string; count: number }>;
  roleDistribution: Array<{ role: string; count: number }>;
}
