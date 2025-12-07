'use client';

import { useState, useMemo, useEffect } from 'react';
import { ScrapedDataEntry, DMEntry, IndexEntry, SendMessageEntry, DashboardStats, AnalyticsData } from '@/lib/types';
import Sidebar from '@/components/dashboard/Sidebar';
// FeedbackModal removed - no longer needed for Combined Leads
import { 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';

interface DashboardClientProps {
  indexData: IndexEntry[];
  scrapedData: ScrapedDataEntry[];
  dmData: DMEntry[];
  sendMessageData: SendMessageEntry[];
  stats: DashboardStats;
  analytics: AnalyticsData;
  error: string | null;
}

type ViewType = 'overview' | 'posts' | 'dms' | 'messages';

// Chart colors
const CHART_COLORS = {
  primary: '#0ea5e9',
  secondary: '#06b6d4',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
};

const PIE_COLORS = ['#0ea5e9', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

export default function DashboardClient({ indexData, scrapedData, dmData, sendMessageData, stats, analytics, error }: DashboardClientProps) {
  // Helper function to get post author name from LinkedIn post URL
  // Matches the URL to scraped data to get the accurate author name
  const getPostAuthorName = (linkedInPostUrl: string): string => {
    if (!linkedInPostUrl) return "LinkedIn Post";
    
    // Normalize URL for comparison (remove protocol, www, trailing slashes)
    const normalizeUrl = (url: string): string => {
      return url
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '');
    };
    
    const normalizedPostUrl = normalizeUrl(linkedInPostUrl);
    
    // Find matching scraped data entry by LinkedIn Post URL
    const matchingEntry = scrapedData.find(entry => {
      if (!entry['Linkedin Post']) return false;
      const normalizedEntryUrl = normalizeUrl(entry['Linkedin Post']);
      return normalizedEntryUrl === normalizedPostUrl;
    });
    
    // If found, use the LinkedIn Post User (author name) from scraped data
    if (matchingEntry && matchingEntry['LinkedIn Post User']) {
      return matchingEntry['LinkedIn Post User'] + "'s post";
    }
    
    // Fallback: try to match with indexData (posts)
    const matchingPost = indexData.find(post => {
      if (!post.postUrl) return false;
      const normalizedPostUrlFromIndex = normalizeUrl(post.postUrl);
      return normalizedPostUrlFromIndex === normalizedPostUrl;
    });
    
    // If we found a matching post, try to get author from its scraped data
    if (matchingPost) {
      const postScraped = scrapedData.filter(e => e.post_gid === matchingPost.gid);
      const postAuthorEntry = postScraped.find(e => e['LinkedIn Post User']);
      if (postAuthorEntry && postAuthorEntry['LinkedIn Post User']) {
        return postAuthorEntry['LinkedIn Post User'] + "'s post";
      }
    }
    
    // Final fallback: try to extract from URL (less accurate)
    try {
      const postsMatch = linkedInPostUrl.match(/\/posts\/([^\/\?]+)/);
      if (postsMatch && postsMatch[1]) {
        const postId = postsMatch[1];
        const parts = postId.split('_');
        const namePart = parts[0];
        const nameComponents = namePart.split('-');
        const nameWords = nameComponents.filter(part => !/^\d+$/.test(part));
        
        if (nameWords.length >= 2) {
          const firstName = nameWords[0].charAt(0).toUpperCase() + nameWords[0].slice(1);
          const lastName = nameWords[nameWords.length - 1].charAt(0).toUpperCase() + nameWords[nameWords.length - 1].slice(1);
          return `${firstName} ${lastName}'s post`;
        } else if (nameWords.length === 1) {
          const name = nameWords[0].charAt(0).toUpperCase() + nameWords[0].slice(1);
          return `${name}'s post`;
        }
      }
    } catch (e) {
      // Ignore errors
    }
    
    return "LinkedIn Post";
  };
  const [activeView, setActiveView] = useState<ViewType>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedScrapedEntry, setSelectedScrapedEntry] = useState<ScrapedDataEntry | null>(null);
  const [selectedPost, setSelectedPost] = useState<IndexEntry | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Advanced filters for scraped data
  const [selectedPosts, setSelectedPosts] = useState<Set<number>>(new Set());
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [selectedEngagementTypes, setSelectedEngagementTypes] = useState<Set<string>>(new Set());
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [roleSearch, setRoleSearch] = useState('');

  // Posts view state
  const [postSearchTerm, setPostSearchTerm] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Handle navigation from sidebar
  useEffect(() => {
    const handleNavClick = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setActiveView(customEvent.detail as ViewType);
    };
    window.addEventListener('dashboard-nav', handleNavClick);
    return () => {
      window.removeEventListener('dashboard-nav', handleNavClick);
    };
  }, []);

  // Post filter for Combined Leads
  const [selectedPostForLeads, setSelectedPostForLeads] = useState<IndexEntry | null>(null);

  // Messages Approval view state
  const [messageSearchTerm, setMessageSearchTerm] = useState('');
  const [updatingMessageId, setUpdatingMessageId] = useState<number | null>(null);
  const [localSendMessageData, setLocalSendMessageData] = useState<SendMessageEntry[]>(sendMessageData);
  const [expandedHeadlines, setExpandedHeadlines] = useState<Set<number>>(new Set());

  // Combine scraped data and combined leads into one unified list
  const allLeads = useMemo(() => {
    // Convert scraped data to lead format
    const scrapedLeads = scrapedData.map(entry => ({
      rowId: `scraped-${entry.rowId}`,
      'Linkedin Post': entry['Linkedin Post'],
      'First Name': entry['First Name'],
      'Last Name': entry['Last Name'],
      'Profile URL': entry['Profile URL'],
      source: 'scraped' as const,
    }));
    
    // Convert combined leads
    const combinedLeads = dmData.map(entry => ({
      rowId: `combined-${entry.rowId}`,
      'Linkedin Post': entry['Linkedin Post'],
      'First Name': entry['First Name'],
      'Last Name': entry['Last Name'],
      'Profile URL': entry['Profile URL'],
      source: 'combined' as const,
    }));
    
    // Merge and remove duplicates based on LinkedIn Post URL + First Name + Last Name
    const seen = new Set<string>();
    const merged: Array<typeof scrapedLeads[0] & { source: 'scraped' | 'combined' }> = [];
    
    [...scrapedLeads, ...combinedLeads].forEach(lead => {
      const key = `${lead['Linkedin Post']}_${lead['First Name']}_${lead['Last Name']}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(lead);
      }
    });
    
    return merged;
  }, [scrapedData, dmData]);

  // Normalize URL for comparison (handle www, trailing slashes, etc.)
  const normalizeUrl = (url: string): string => {
    if (!url) return '';
    return url
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '');
  };

  // Filter all leads (by post and search)
  const filteredLeads = useMemo(() => {
    let filtered = allLeads;
    
    // Filter by selected post - normalize URLs for comparison
    if (selectedPostForLeads) {
      const normalizedPostUrl = normalizeUrl(selectedPostForLeads.postUrl);
      filtered = filtered.filter(lead => {
        const normalizedLeadUrl = normalizeUrl(lead['Linkedin Post'] || '');
        return normalizedLeadUrl === normalizedPostUrl;
      });
    }
    
    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(lead => 
        (lead['First Name'] || '').toLowerCase().includes(search) ||
        (lead['Last Name'] || '').toLowerCase().includes(search) ||
        (lead['Linkedin Post'] || '').toLowerCase().includes(search) ||
        (lead['Profile URL'] || '').toLowerCase().includes(search)
      );
    }
    return filtered;
  }, [allLeads, selectedPostForLeads, searchTerm]);

  // Check if optional fields exist in data
  const hasCompanyData = useMemo(() => {
    return scrapedData.some(e => e.Company && e.Company.trim() !== '');
  }, [scrapedData]);

  // Export leads to CSV
  const handleExportReport = () => {
    try {
      // Prepare CSV data - export all leads or filtered leads based on current view
      const leadsToExport = activeView === 'dms' && selectedPostForLeads 
        ? filteredLeads 
        : allLeads;
      
      if (leadsToExport.length === 0) {
        alert('No leads to export. Please ensure you have leads in your dashboard.');
        return;
      }

      // CSV Headers
      const headers = ['First Name', 'Last Name', 'LinkedIn Post', 'Profile URL', 'Source'];
      
      // Convert leads to CSV rows
      const csvRows = [
        headers.join(','), // Header row
        ...leadsToExport.map(lead => {
          // Escape commas and quotes in CSV values
          const escapeCSV = (value: string | null | undefined) => {
            if (!value) return '';
            const stringValue = String(value);
            // If value contains comma, quote, or newline, wrap in quotes and escape quotes
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          };

          return [
            escapeCSV(lead['First Name']),
            escapeCSV(lead['Last Name']),
            escapeCSV(lead['Linkedin Post']),
            escapeCSV(lead['Profile URL']),
            escapeCSV(lead.source === 'scraped' ? 'Scraped' : 'Combined Leads')
          ].join(',');
        })
      ];

      // Create CSV content
      const csvContent = csvRows.join('\n');
      
      // Create Blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `chatwalrus-leads-export-${timestamp}.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log(`Exported ${leadsToExport.length} leads to ${filename}`);
    } catch (error) {
      console.error('Error exporting leads:', error);
      alert('Failed to export leads. Please try again.');
    }
  };

  const hasRoleData = useMemo(() => {
    return scrapedData.some(e => e.Role && e.Role.trim() !== '');
  }, [scrapedData]);

  const hasHeadlineData = useMemo(() => {
    return scrapedData.some(e => e.Headline && e.Headline.trim() !== '');
  }, [scrapedData]);

  const hasEngagementData = useMemo(() => {
    return scrapedData.some(e => e['Engagement Type']);
  }, [scrapedData]);

  // Get unique values for filters (normalized) - only if data exists
  const uniqueCompanies = useMemo(() => {
    if (!hasCompanyData) return [];
    const companies = new Set(scrapedData.map(e => e.Company?.trim()).filter(c => c && c !== ''));
    return Array.from(companies).sort();
  }, [scrapedData, hasCompanyData]);

  const uniqueRoles = useMemo(() => {
    if (!hasRoleData) return [];
    const roles = new Set(scrapedData.map(e => e.Role?.trim()).filter(r => r && r !== ''));
    return Array.from(roles).sort();
  }, [scrapedData, hasRoleData]);

  // Filter companies and roles based on search
  const filteredCompanies = useMemo(() => {
    if (!companySearch) return uniqueCompanies;
    const search = companySearch.toLowerCase();
    return uniqueCompanies.filter(c => c.toLowerCase().includes(search));
  }, [uniqueCompanies, companySearch]);

  const filteredRoles = useMemo(() => {
    if (!roleSearch) return uniqueRoles;
    const search = roleSearch.toLowerCase();
    return uniqueRoles.filter(r => r.toLowerCase().includes(search));
  }, [uniqueRoles, roleSearch]);

  // Group scraped data by post
  const scrapedDataByPost = useMemo(() => {
    const grouped = new Map<number, ScrapedDataEntry[]>();
    scrapedData.forEach(entry => {
      if (entry.post_gid) {
        if (!grouped.has(entry.post_gid)) {
          grouped.set(entry.post_gid, []);
        }
        grouped.get(entry.post_gid)!.push(entry);
      }
    });
    return grouped;
  }, [scrapedData]);

  // Get post stats
  const postStats = useMemo(() => {
    return indexData.map(post => {
      const entries = scrapedData.filter(e => e.post_gid === post.gid);
      const entriesWithEngagement = entries.filter(e => e['Engagement Type']);
      const liked = entriesWithEngagement.filter(e => e['Engagement Type'] === 'Liked').length;
      const commented = entriesWithEngagement.filter(e => e['Engagement Type'] === 'Commented').length;
      const companies = new Set(entries.filter(e => e.Company && e.Company.trim() !== '').map(e => e.Company!.trim()));
      return {
        post,
        total: entries.length,
        liked,
        commented,
        uniqueCompanies: companies.size,
      };
    });
  }, [indexData, scrapedData]);

  // Filter scraped entries with advanced filters
  const filteredScrapedEntries = useMemo(() => {
    let filtered = [...scrapedData]; // Create a copy to avoid mutating original
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(entry => {
        const firstName = (entry['First Name'] || '').toLowerCase();
        const lastName = (entry['Last Name'] || '').toLowerCase();
        const company = (entry.Company || '').toLowerCase().trim();
        const role = (entry.Role || '').toLowerCase().trim();
        const headline = (entry.Headline || '').toLowerCase();
        const about = (entry.About || '').toLowerCase();
        
        return firstName.includes(search) ||
               lastName.includes(search) ||
               company.includes(search) ||
               role.includes(search) ||
               headline.includes(search) ||
               about.includes(search);
      });
    }
    
    // Post filter (support both single and multi-select)
    if (selectedPost) {
      filtered = filtered.filter(entry => entry.post_gid === selectedPost.gid);
    } else if (selectedPosts.size > 0) {
      filtered = filtered.filter(entry => entry.post_gid && selectedPosts.has(entry.post_gid));
    }
    
    // Company filter (normalized comparison - handle whitespace)
    if (selectedCompanies.size > 0) {
      filtered = filtered.filter(entry => {
        if (!entry.Company) return false;
        const entryCompany = (entry.Company || '').trim();
        // Check if the trimmed company name is in the selected set
        return selectedCompanies.has(entryCompany);
      });
    }
    
    // Role filter (normalized comparison - handle whitespace)
    if (selectedRoles.size > 0) {
      filtered = filtered.filter(entry => {
        if (!entry.Role) return false;
        const entryRole = (entry.Role || '').trim();
        // Check if the trimmed role is in the selected set
        return selectedRoles.has(entryRole);
      });
    }
    
    // Engagement type filter
    if (selectedEngagementTypes.size > 0) {
      filtered = filtered.filter(entry => {
        const engagementType = entry['Engagement Type'];
        return engagementType && selectedEngagementTypes.has(engagementType);
      });
    }
    
    // Debug logging (remove in production)
    if (selectedCompanies.size > 0 || selectedRoles.size > 0 || selectedEngagementTypes.size > 0) {
      console.log('Filtering scraped data:', {
        total: scrapedData.length,
        filtered: filtered.length,
        selectedCompanies: Array.from(selectedCompanies),
        selectedRoles: Array.from(selectedRoles),
        selectedEngagementTypes: Array.from(selectedEngagementTypes),
      });
    }
    
    return filtered;
  }, [scrapedData, searchTerm, selectedPost, selectedPosts, selectedCompanies, selectedRoles, selectedEngagementTypes]);

  // Update local state when prop changes
  useEffect(() => {
    setLocalSendMessageData(sendMessageData);
  }, [sendMessageData]);

  // Filter messages
  const filteredMessages = useMemo(() => {
    let filtered = localSendMessageData;
    
    if (messageSearchTerm) {
      const search = messageSearchTerm.toLowerCase().trim();
      filtered = filtered.filter(entry => {
        const firstName = (entry['First Name'] || '').toLowerCase();
        const lastName = (entry['Last Name'] || '').toLowerCase();
        const company = (entry.Company || '').toLowerCase().trim();
        const headline = (entry.Headline || '').toLowerCase();
        const linkedinPost = (entry['Linkedin Post'] || '').toLowerCase();
        
        return firstName.includes(search) ||
               lastName.includes(search) ||
               company.includes(search) ||
               headline.includes(search) ||
               linkedinPost.includes(search);
      });
    }
    
    return filtered;
  }, [localSendMessageData, messageSearchTerm]);

  // Handle approval status update
  const handleMessageApprovalUpdate = async (entry: SendMessageEntry, newApproval: SendMessageEntry['Approval']) => {
    // Prevent users from manually setting "sent" status - it's system-managed
    if (newApproval === 'sent') {
      alert('"Sent" status is system-managed and cannot be set manually. Please select "Approved" or "Rejected".');
      return;
    }
    
    // Prevent updating if already sent
    if (entry.Approval === 'sent') {
      alert('This message has already been sent and cannot be modified.');
      return;
    }
    
    setUpdatingMessageId(entry.rowId);
    
    try {
      // Optimistically update local state
      setLocalSendMessageData(prev => 
        prev.map(msg => 
          msg.rowId === entry.rowId 
            ? { ...msg, Approval: newApproval }
            : msg
        )
      );

      // Call API to update
      const response = await fetch('/api/message/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rowId: entry.rowId,
          approval: newApproval,
          linkedinPost: entry['Linkedin Post'],
          firstName: entry['First Name'],
          lastName: entry['Last Name'],
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('API Error Response:', responseData);
        const errorMessage = responseData.details || responseData.error || 'Failed to update approval status';
        throw new Error(errorMessage);
      }

      // Check if update was actually successful
      if (responseData.success === false || responseData.warning) {
        console.warn('Update warning:', responseData.warning || responseData.message);
        // Still show success but warn user
        if (responseData.warning) {
          alert(`Update may not have been saved to Google Sheet: ${responseData.warning}`);
        }
      }

      // Show success notification
      console.log('Approval status updated successfully:', responseData);
      
      // Show success message to user
      alert('Approval status updated successfully in Google Sheet!');
    } catch (error) {
      console.error('Error updating approval status:', error);
      
      // Revert optimistic update on error
      setLocalSendMessageData(prev => 
        prev.map(msg => 
          msg.rowId === entry.rowId 
            ? { ...msg, Approval: entry.Approval }
            : msg
        )
      );
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to update approval status';
      alert(`Failed to update approval status: ${errorMessage}\n\nPlease check:\n1. Google Apps Script is deployed\n2. Script URL is correct in .env.local\n3. Script is authorized`);
    } finally {
      setUpdatingMessageId(null);
    }
  };

  // Get approval badge styling
  const getApprovalBadge = (approval: SendMessageEntry['Approval']) => {
    const styles = {
      approval: 'bg-green-100 text-green-800 border-green-200',
      reject: 'bg-red-100 text-red-800 border-red-200',
      sent: 'bg-blue-100 text-blue-800 border-blue-200',
    };
    
    const labels = {
      approval: 'Approved',
      reject: 'Rejected',
      sent: 'Sent',
    };
    
    return {
      className: `px-3 py-1 rounded-full text-xs font-semibold border ${styles[approval]}`,
      label: labels[approval],
    };
  };

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <div className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
          <div className="p-8">
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <h2 className="text-xl font-bold text-red-900 mb-2">Error Loading Dashboard</h2>
              <p className="text-red-700 mb-4">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <Sidebar 
        isCollapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeView={activeView}
      />
      
      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 bg-gradient-to-br from-slate-50 via-white to-slate-50 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        {/* Top Header */}
        <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200/50 h-20 flex items-center justify-between px-6 sticky top-0 z-30 shadow-sm">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {activeView === 'overview' && 'Dashboard Overview'}
                {activeView === 'posts' && 'LinkedIn Posts'}
                {activeView === 'dms' && 'All Leads'}
                {activeView === 'messages' && 'Messages Approval'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeView === 'overview' && 'Quick overview of your campaigns'}
                {activeView === 'posts' && 'All posts being tracked in your campaigns'}
                {activeView === 'dms' && 'All leads from scraped data and combined leads, filtered by post'}
                {activeView === 'messages' && 'Review and approve messages before sending'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={handleExportReport}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Report
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="p-6 max-w-7xl mx-auto">
          {/* Overview View */}
          {activeView === 'overview' && (
            <div id="overview" className="space-y-6">
              {/* Modern Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Posts Card */}
                <div className="group relative overflow-hidden bg-gradient-to-br from-sky-50 to-cyan-50 rounded-xl border border-sky-200 p-6 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-600 mb-1">Total Posts</p>
                      <p className="text-3xl font-bold text-slate-900 mb-2">{stats.totalPosts}</p>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Active campaigns</span>
                      </div>
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-br from-sky-400 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Scraped Profiles Card */}
                <div className="group relative overflow-hidden bg-gradient-to-br from-cyan-50 to-sky-50 rounded-xl border border-cyan-200 p-6 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-600 mb-1">Scraped Profiles</p>
                      <p className="text-3xl font-bold text-slate-900 mb-2">{stats.totalScraped}</p>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        <span>Profiles collected</span>
                      </div>
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-sky-400 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Combined Leads Card */}
                <div className="group relative overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 p-6 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-pointer" onClick={() => setActiveView('dms')}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-600 mb-1">All Leads</p>
                      <p className="text-3xl font-bold text-slate-900 mb-2">{allLeads.length}</p>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span>Ready for outreach</span>
                      </div>
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Leads Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Recent Leads</h3>
                      <p className="text-sm text-slate-500 mt-0.5">Latest leads from your campaigns</p>
                    </div>
                    <button
                      onClick={() => setActiveView('dms')}
                      className="px-4 py-2 text-sm font-medium text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 rounded-lg transition-colors flex items-center gap-2"
                    >
                      View All
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50/50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">LinkedIn Post</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Profile</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allLeads.slice(0, 5).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-slate-400">
                            <div className="flex flex-col items-center gap-2">
                              <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                              </svg>
                              <p className="text-sm">No leads yet. Start a campaign to see leads here.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        allLeads.slice(0, 5).map((lead) => {
                          const post = indexData.find(p => p.postUrl === lead['Linkedin Post']);
                          return (
                            <tr key={lead.rowId} className="hover:bg-gradient-to-r hover:from-sky-50/30 hover:to-cyan-50/30 transition-colors group">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                                    {lead['First Name']?.[0]?.toUpperCase() || ''}{lead['Last Name']?.[0]?.toUpperCase() || ''}
                                  </div>
                                  <div>
                                    <div className="text-sm font-semibold text-slate-900">
                                      {lead['First Name']} {lead['Last Name']}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="max-w-xs">
                                  {post ? (
                                    <button
                                      onClick={() => {
                                        setActiveView('posts');
                                        setSelectedPost(post);
                                      }}
                                      className="text-sm text-slate-700 hover:text-cyan-600 font-medium hover:underline text-left line-clamp-1 group-hover:text-cyan-600 transition-colors"
                                      title={post.postTopic || lead['Linkedin Post']}
                                    >
                                      {post.postTopic?.substring(0, 40) || lead['Linkedin Post'].substring(0, 40)}
                                      {(post.postTopic && post.postTopic.length > 40) || (!post.postTopic && lead['Linkedin Post'].length > 40) ? '...' : ''}
                                    </button>
                                  ) : (
                                    <span className="text-sm text-slate-500 line-clamp-1">{lead['Linkedin Post']}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {lead['Profile URL'] ? (
                                  <a
                                    href={lead['Profile URL']}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-sm text-cyan-600 hover:text-cyan-700 font-medium hover:underline group-hover:text-cyan-700 transition-colors"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    View Profile
                                  </a>
                                ) : (
                                  <span className="text-sm text-slate-400">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {allLeads.length > 5 && (
                  <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-200">
                    <button
                      onClick={() => setActiveView('dms')}
                      className="w-full text-center text-sm font-medium text-cyan-600 hover:text-cyan-700 py-2 rounded-lg hover:bg-cyan-50 transition-colors"
                    >
                      View all {allLeads.length} leads →
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-shadow">
                  <h4 className="text-base font-semibold text-slate-900 mb-2">View All Posts</h4>
                  <p className="text-sm text-slate-600 mb-4">See all LinkedIn posts and their performance metrics</p>
                  <button
                    onClick={() => setActiveView('posts')}
                    className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
                  >
                    Go to Posts →
                  </button>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-200 p-6 hover:shadow-lg transition-shadow">
                  <h4 className="text-base font-semibold text-slate-900 mb-2">Manage Leads</h4>
                  <p className="text-sm text-slate-600 mb-4">Filter and search through all your collected leads</p>
                  <button
                    onClick={() => setActiveView('dms')}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-all text-sm font-medium shadow-sm"
                  >
                    View All Leads →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Posts View */}
          {activeView === 'posts' && (
            <div id="posts" className="space-y-6">
              {/* Search and Stats Bar */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="flex-1 w-full sm:max-w-md">
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Search posts by topic..."
                        value={postSearchTerm}
                        onChange={(e) => setPostSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600">Total Posts:</span>
                      <span className="font-bold text-slate-900">{indexData.length}</span>
                    </div>
                    <div className="h-6 w-px bg-slate-300"></div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600">Total Scraped:</span>
                      <span className="font-bold text-slate-900">{scrapedData.length}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Posts Grid */}
              {indexData.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
                  <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-lg font-medium text-slate-900 mb-2">No posts found</p>
                  <p className="text-sm text-slate-500">Start a campaign to see posts here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {indexData
                    .filter(post => 
                      !postSearchTerm || 
                      (post.postTopic || '').toLowerCase().includes(postSearchTerm.toLowerCase()) ||
                      (post.postUrl || '').toLowerCase().includes(postSearchTerm.toLowerCase())
                    )
                    .map((post, idx) => {
                      const postScraped = scrapedData.filter(e => e.post_gid === post.gid);
                      const postScrapedCount = postScraped.length;
                      const postLeads = allLeads.filter(lead => lead['Linkedin Post'] === post.postUrl);
                      const leadCount = postLeads.length;
                      
                      // Get post author name from scraped data (LinkedIn Post User)
                      const postAuthorEntry = postScraped.find(e => e['LinkedIn Post User']);
                      const postAuthor = postAuthorEntry?.['LinkedIn Post User'] || null;

                      const handleCopyUrl = () => {
                        navigator.clipboard.writeText(post.postUrl);
                        setCopiedUrl(post.postUrl);
                        setTimeout(() => setCopiedUrl(null), 2000);
                      };

                      return (
                        <div
                          key={post.gid || idx}
                          className="group relative bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/50 shadow-sm hover:shadow-xl hover:border-sky-300 transition-all duration-300 overflow-hidden h-full flex flex-col"
                        >
                          {/* Gradient Top Bar */}
                          <div className="h-2 bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400"></div>
                          
                          <div className="p-8 flex flex-col flex-1">
                            {/* Header Section */}
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex-1 min-w-0">
                                {/* Post Author Name */}
                                {postAuthor ? (
                                  <div className="flex items-center gap-3 mb-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-sky-400 to-cyan-400 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg">
                                      {postAuthor.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                      <p className="text-base font-bold text-slate-900 line-clamp-1">{postAuthor}</p>
                                      <p className="text-sm text-slate-500">Post #{idx + 1}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mb-4">
                                    <p className="text-base font-bold text-slate-900">Post #{idx + 1}</p>
                                  </div>
                                )}
                                
                                {/* Post Topic */}
                                {post.postTopic && (
                                  <h3 className="text-lg font-bold text-slate-900 mb-6 line-clamp-2 group-hover:text-emerald-600 transition-colors">
                                    {post.postTopic}
                                  </h3>
                                )}
                              </div>
                            </div>

                            {/* Stats Cards - Modern Design */}
                            <div className="grid grid-cols-2 gap-4 mb-8">
                              {/* Scraped Count */}
                              <div className="relative overflow-hidden bg-gradient-to-br from-sky-50 to-cyan-50 rounded-xl border border-sky-200 p-5 hover:scale-105 transition-transform cursor-pointer">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-cyan-400 rounded-lg flex items-center justify-center shadow-sm">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                  </div>
                                  <span className="text-sm font-semibold text-sky-600">Scraped</span>
                                </div>
                                <p className="text-3xl font-bold text-sky-700">{postScrapedCount}</p>
                              </div>

                              {/* Leads Count */}
                              <div 
                                onClick={() => {
                                  setSelectedPostForLeads(post);
                                  setActiveView('dms');
                                }}
                                className="relative overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 p-5 hover:scale-105 transition-transform cursor-pointer group/lead"
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-sm group-hover/lead:scale-110 transition-transform">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                  </div>
                                  <span className="text-sm font-semibold text-emerald-700">Leads</span>
                                </div>
                                <p className="text-3xl font-bold text-emerald-900">{leadCount}</p>
                              </div>
                            </div>

                            {/* Post URL - Compact Design */}
                            <div className="mb-8 p-4 bg-slate-50/50 rounded-xl border border-slate-200/50">
                              <div className="flex items-center gap-3">
                                <a
                                  href={post.postUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 text-sm text-emerald-600 hover:text-emerald-700 truncate font-medium"
                                  title={post.postUrl}
                                >
                                  {post.postUrl.replace('https://www.', '').replace('https://', '').substring(0, 50)}...
                                </a>
                                <button
                                  onClick={handleCopyUrl}
                                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="Copy URL"
                                >
                                  {copiedUrl === post.postUrl ? (
                                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Action Buttons - Modern Design */}
                            <div className="flex gap-3 mt-auto pt-4">
                              <button
                                onClick={() => {
                                  setSelectedPostForLeads(post);
                                  setActiveView('dms');
                                }}
                                className="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-base font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                View Leads
                              </button>
                              <a
                                href={post.postUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-6 py-3 bg-white border-2 border-slate-200 text-slate-700 text-base font-semibold rounded-xl hover:border-emerald-300 hover:bg-emerald-50 transition-all flex items-center justify-center gap-2"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                Open
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Empty State for Filtered Results */}
              {indexData.length > 0 && indexData.filter(post => 
                !postSearchTerm || 
                (post.postTopic || '').toLowerCase().includes(postSearchTerm.toLowerCase()) ||
                (post.postUrl || '').toLowerCase().includes(postSearchTerm.toLowerCase())
              ).length === 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
                  <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-lg font-medium text-slate-900 mb-2">No posts found</p>
                  <p className="text-sm text-slate-500 mb-4">Try adjusting your search terms.</p>
                  <button
                    onClick={() => setPostSearchTerm('')}
                    className="text-sm text-cyan-600 hover:text-cyan-700 font-medium"
                  >
                    Clear search
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Merged Leads View (Scraped Data + Combined Leads) */}
          {activeView === 'dms' && (
            <div id="dms" className="space-y-6">
              {/* Filters */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Search by name, LinkedIn post, or profile URL..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <select
                    value={selectedPostForLeads?.postUrl || 'all'}
                    onChange={(e) => {
                      if (e.target.value === 'all') {
                        setSelectedPostForLeads(null);
                      } else {
                        const post = indexData.find(p => p.postUrl === e.target.value);
                        setSelectedPostForLeads(post || null);
                      }
                    }}
                    className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="all">All Posts</option>
                    {indexData.map(post => {
                      // Get post author name from scraped data (LinkedIn Post User)
                      const postScraped = scrapedData.filter(e => e.post_gid === post.gid);
                      const postAuthorEntry = postScraped.find(e => e['LinkedIn Post User']);
                      const postAuthor = postAuthorEntry?.['LinkedIn Post User'] || null;
                      
                      // Display priority: Author Name > Post Topic > Post URL (shortened)
                      const displayName = postAuthor || post.postTopic || post.postUrl?.substring(0, 50) || 'Untitled Post';
                      
                      return (
                        <option key={post.postUrl} value={post.postUrl}>
                          {displayName}
                        </option>
                      );
                    })}
                  </select>
                  {selectedPostForLeads && (
                    <button
                      onClick={() => setSelectedPostForLeads(null)}
                      className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>
              </div>

              {/* Results Summary */}
              <div className="bg-gradient-to-r from-cyan-50 to-sky-50 rounded-lg border border-cyan-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-sm text-slate-600">Total Leads</p>
                      <p className="text-2xl font-bold text-slate-900">{filteredLeads.length}</p>
                    </div>
                    <div className="h-12 w-px bg-cyan-200"></div>
                    <div>
                      <p className="text-sm text-slate-600">From Total</p>
                      <p className="text-2xl font-bold text-slate-900">{allLeads.length}</p>
                    </div>
                    {selectedPostForLeads && (() => {
                      // Get post author name from scraped data
                      const postScraped = scrapedData.filter(e => e.post_gid === selectedPostForLeads.gid);
                      const postAuthorEntry = postScraped.find(e => e['LinkedIn Post User']);
                      const postAuthor = postAuthorEntry?.['LinkedIn Post User'] || null;
                      const displayName = postAuthor || selectedPostForLeads.postTopic || 'Untitled Post';
                      
                      return (
                        <>
                          <div className="h-12 w-px bg-cyan-200"></div>
                          <div>
                            <p className="text-sm text-slate-600">Selected Post</p>
                            <p className="text-sm font-semibold text-slate-900 line-clamp-1">{displayName}</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Merged Leads Table */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">LinkedIn Post</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Profile URL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredLeads.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                            {allLeads.length === 0 
                              ? 'No leads found. Leads will appear here after campaigns run.'
                              : 'No entries match your filters.'}
                          </td>
                        </tr>
                      ) : (
                        filteredLeads.map((lead) => {
                          const post = indexData.find(p => p.postUrl === lead['Linkedin Post']);
                          return (
                            <tr key={lead.rowId} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-sky-500 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                                    {lead['First Name']?.[0]?.toUpperCase() || ''}{lead['Last Name']?.[0]?.toUpperCase() || ''}
                                  </div>
                                  <div className="text-sm font-medium text-slate-900">
                                    {lead['First Name']} {lead['Last Name']}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <a
                                  href={lead['Linkedin Post']}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-cyan-600 hover:text-cyan-700 font-medium hover:underline truncate max-w-md block"
                                  title={post?.postTopic || lead['Linkedin Post']}
                                  onClick={(e) => {
                                    // If clicking the link, don't trigger filter
                                    e.stopPropagation();
                                  }}
                                >
                                  {lead['Linkedin Post']}
                                </a>
                                {post?.postTopic && (
                                  <div className="text-xs text-slate-500 mt-1 truncate max-w-md" title={post.postTopic}>
                                    {post.postTopic}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                {lead['Profile URL'] ? (
                                  <a
                                    href={lead['Profile URL']}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-cyan-600 hover:text-cyan-700 font-medium hover:underline truncate max-w-md block"
                                  >
                                    {lead['Profile URL']}
                                  </a>
                                ) : (
                                  <span className="text-sm text-slate-400">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    Showing <span className="font-semibold text-slate-900">{filteredLeads.length}</span> of{' '}
                    <span className="font-semibold text-slate-900">{allLeads.length}</span> leads
                  </div>
                  {selectedPostForLeads && (() => {
                    // Get post author name from scraped data
                    const postScraped = scrapedData.filter(e => e.post_gid === selectedPostForLeads.gid);
                    const postAuthorEntry = postScraped.find(e => e['LinkedIn Post User']);
                    const postAuthor = postAuthorEntry?.['LinkedIn Post User'] || null;
                    const displayName = postAuthor || selectedPostForLeads.postTopic || 'Untitled Post';
                    
                    return (
                      <div className="text-xs text-slate-500">
                        Filtered by: {displayName}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Scraped Entry Detail Modal */}
          {selectedScrapedEntry && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center px-6 py-12" onClick={() => setSelectedScrapedEntry(null)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-slate-900">
                    {selectedScrapedEntry['First Name']} {selectedScrapedEntry['Last Name']}
                  </h2>
                  <button
                    onClick={() => setSelectedScrapedEntry(null)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-slate-600 mb-2">Company & Role</h3>
                    <p className="text-slate-900">{selectedScrapedEntry.Company} • {selectedScrapedEntry.Role}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-600 mb-2">Headline</h3>
                    <p className="text-slate-900">{selectedScrapedEntry.Headline || '-'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-600 mb-2">About</h3>
                    {selectedScrapedEntry.About && selectedScrapedEntry.About.trim() !== '' ? (
                      <div className="text-slate-900 whitespace-pre-wrap leading-relaxed">
                        {selectedScrapedEntry.About}
                      </div>
                    ) : (
                      <p className="text-slate-500 italic">No about information available</p>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-600 mb-2">Engagement</h3>
                    <p className="text-slate-900">{selectedScrapedEntry['Engagement Type']}</p>
                    {selectedScrapedEntry['Comment Text'] && (
                      <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                        <p className="text-slate-700 italic">&quot;{selectedScrapedEntry['Comment Text']}&quot;</p>
                      </div>
                    )}
                  </div>
                  {selectedScrapedEntry['Profile URL'] && (
                    <div>
                      <a
                        href={selectedScrapedEntry['Profile URL']}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-600 hover:text-cyan-700 font-medium"
                      >
                        View LinkedIn Profile →
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Messages Approval View */}
          {activeView === 'messages' && (
            <div id="messages" className="space-y-6">
              {/* Filters */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Search by name, company, headline, or LinkedIn post..."
                      value={messageSearchTerm}
                      onChange={(e) => setMessageSearchTerm(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  {messageSearchTerm && (
                    <button
                      onClick={() => setMessageSearchTerm('')}
                      className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Clear Search
                    </button>
                  )}
                </div>
              </div>

              {/* Results Summary */}
              <div className="bg-gradient-to-r from-cyan-50 to-sky-50 rounded-lg border border-cyan-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-sm text-slate-600">Total Messages</p>
                      <p className="text-2xl font-bold text-slate-900">{filteredMessages.length}</p>
                    </div>
                    <div className="h-12 w-px bg-cyan-200"></div>
                    <div>
                      <p className="text-sm text-slate-600">Approved</p>
                      <p className="text-2xl font-bold text-green-600">
                        {filteredMessages.filter(m => m.Approval === 'approval').length}
                      </p>
                    </div>
                    <div className="h-12 w-px bg-cyan-200"></div>
                    <div>
                      <p className="text-sm text-slate-600">Rejected</p>
                      <p className="text-2xl font-bold text-red-600">
                        {filteredMessages.filter(m => m.Approval === 'reject').length}
                      </p>
                    </div>
                    <div className="h-12 w-px bg-cyan-200"></div>
                    <div>
                      <p className="text-sm text-slate-600">Sent</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {filteredMessages.filter(m => m.Approval === 'sent').length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages Table */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Company</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Headline</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">LinkedIn Post</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Profile</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Approval</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredMessages.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                            {localSendMessageData.length === 0 
                              ? 'No messages found. Messages will appear here when ready for approval.'
                              : 'No entries match your search.'}
                          </td>
                        </tr>
                      ) : (
                        filteredMessages.map((entry) => {
                          const badge = getApprovalBadge(entry.Approval);
                          const isUpdating = updatingMessageId === entry.rowId;
                          
                          return (
                            <tr key={entry.rowId} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-sky-500 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                                    {entry['First Name']?.[0]?.toUpperCase() || ''}{entry['Last Name']?.[0]?.toUpperCase() || ''}
                                  </div>
                                  <div className="text-sm font-medium text-slate-900">
                                    {entry['First Name']} {entry['Last Name']}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-slate-700">
                                  {entry.Company || '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                {entry.Headline ? (
                                  <div className="max-w-xs">
                                    {expandedHeadlines.has(entry.rowId) ? (
                                      <div className="text-sm text-slate-700">
                                        <div className="mb-1 whitespace-pre-wrap break-words">{entry.Headline}</div>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedHeadlines(prev => {
                                              const newSet = new Set(prev);
                                              newSet.delete(entry.rowId);
                                              return newSet;
                                            });
                                          }}
                                          className="text-xs text-cyan-600 hover:text-cyan-700 font-medium hover:underline"
                                        >
                                          Show less
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="text-sm text-slate-700">
                                        <div className="line-clamp-2 break-words">
                                          {entry.Headline}
                                        </div>
                                        {entry.Headline.length > 60 && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setExpandedHeadlines(prev => new Set(prev).add(entry.rowId));
                                            }}
                                            className="text-xs text-cyan-600 hover:text-cyan-700 font-medium hover:underline mt-1"
                                          >
                                            Show full headline
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-sm text-slate-400">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                {entry['Linkedin Post'] ? (
                                  <a
                                    href={entry['Linkedin Post']}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-cyan-600 hover:text-cyan-700 font-medium hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                    title={entry['Linkedin Post']}
                                  >
                                    {getPostAuthorName(entry['Linkedin Post'])}
                                  </a>
                                ) : (
                                  <span className="text-sm text-slate-400">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                {entry['Profile URL'] ? (
                                  <a
                                    href={entry['Profile URL']}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-cyan-600 hover:text-cyan-700 font-medium hover:underline truncate max-w-md block"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    View Profile
                                  </a>
                                ) : (
                                  <span className="text-sm text-slate-400">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <span className={badge.className}>
                                  {badge.label}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  {isUpdating ? (
                                    <div className="flex items-center gap-2 text-slate-500">
                                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                      <span className="text-xs">Updating...</span>
                                    </div>
                                  ) : entry.Approval === 'sent' ? (
                                    <span className="px-3 py-1.5 text-sm text-slate-600 italic">Sent (System)</span>
                                  ) : (
                                    <select
                                      value={entry.Approval}
                                      onChange={(e) => {
                                        const newApproval = e.target.value as 'approval' | 'reject';
                                        // Only allow approval or reject - sent is system-managed
                                        if (newApproval === 'approval' || newApproval === 'reject') {
                                          handleMessageApprovalUpdate(entry, newApproval);
                                        }
                                      }}
                                      className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-white text-slate-700"
                                      disabled={isUpdating}
                                    >
                                      <option value="approval">Approved</option>
                                      <option value="reject">Rejected</option>
                                    </select>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    Showing <span className="font-semibold text-slate-900">{filteredMessages.length}</span> of{' '}
                    <span className="font-semibold text-slate-900">{localSendMessageData.length}</span> messages
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* All DM approval modals removed - Combined Leads is a simple list */}
        </div>
      </main>
    </div>
  );
}
