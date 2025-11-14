import { 
  fetchIndexSheetData, 
  fetchAllScrapedData, 
  fetchAllDMData, 
  calculateStats, 
  generateAnalyticsData 
} from '@/lib/google-sheets';
import DashboardClient from '@/components/DashboardClient';
import { IndexEntry, ScrapedDataEntry, DMEntry, DashboardStats, AnalyticsData } from '@/lib/types';

export const metadata = {
  title: 'Dashboard - ChatWalrus',
  description: 'View and manage your LinkedIn outreach campaigns.',
};

// Force dynamic rendering to ensure fresh data on every request
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  let indexEntries: IndexEntry[] = [];
  let scrapedEntries: ScrapedDataEntry[] = [];
  let dmEntries: DMEntry[] = [];
  let stats: DashboardStats = {
    totalPosts: 0,
    totalScraped: 0,
    totalLiked: 0,
    totalCommented: 0,
    uniqueCompanies: 0,
    uniqueRoles: [],
    totalLeads: 0,
    engagementRate: 0,
    topCompanies: [],
    topRoles: [],
  };
  let analytics: AnalyticsData = {
    postsOverTime: [],
    engagementBreakdown: [],
    companyDistribution: [],
    roleDistribution: [],
  };
  let error: string | null = null;

  try {
    // Fetch all three types of data
    console.log('Fetching Index sheet data...');
    indexEntries = await fetchIndexSheetData();
    
    console.log('Fetching scraped data...');
    scrapedEntries = await fetchAllScrapedData();
    
    console.log('Fetching DM data...');
    dmEntries = await fetchAllDMData();
    
    // Calculate stats and analytics
    stats = calculateStats(indexEntries, scrapedEntries, dmEntries);
    analytics = generateAnalyticsData(indexEntries, scrapedEntries, dmEntries);
    
    console.log('Dashboard data loaded:', {
      posts: indexEntries.length,
      scraped: scrapedEntries.length,
      dms: dmEntries.length,
    });
  } catch (err) {
    console.error('Error loading dashboard data:', err);
    error = err instanceof Error ? err.message : 'Failed to load dashboard data';
  }

  return (
    <DashboardClient 
      indexData={indexEntries}
      scrapedData={scrapedEntries}
      dmData={dmEntries}
      stats={stats}
      analytics={analytics}
      error={error}
    />
  );
}
