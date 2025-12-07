import { NextRequest, NextResponse } from 'next/server';

const SHEET_ID = '11GQ7hgeSR_5ZmBWBwfzWRLLO3jppfGSlqR2zBrIORHY';
const SHEET_NAME = 'Send_Message';

/**
 * API Route to update message approval status in Google Sheets
 * Uses Google Apps Script Web App to update the sheet directly
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rowId, approval, linkedinPost, firstName, lastName } = body;

    console.log('Message Update Request:', {
      rowId,
      approval,
      linkedinPost,
      firstName,
      lastName,
    });

    // Validate required fields
    if (!rowId || !approval) {
      return NextResponse.json(
        { error: 'Missing required fields: rowId, approval' },
        { status: 400 }
      );
    }

    // Validate approval status - only three options: approval, reject, sent
    const validApprovals = ['approval', 'reject', 'sent'];
    if (!validApprovals.includes(approval)) {
      return NextResponse.json(
        { error: 'Invalid approval status. Must be one of: approval, reject, sent' },
        { status: 400 }
      );
    }

    try {
      // First, fetch the sheet to find the exact row
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
      const sheetResponse = await fetch(sheetUrl, { cache: 'no-store' });
      
      if (!sheetResponse.ok) {
        throw new Error(`Failed to fetch sheet: ${sheetResponse.status}`);
      }
      
      const csvText = await sheetResponse.text();
      
      // Parse CSV properly
      const parseCSV = (text: string): string[][] => {
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let currentCell = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          const nextChar = text[i + 1];

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              currentCell += '"';
              i++; // Skip next quote
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = '';
          } else if ((char === '\n' || char === '\r') && !inQuotes) {
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

        if (currentCell || currentRow.length > 0) {
          currentRow.push(currentCell);
          rows.push(currentRow);
        }

        return rows;
      };
      
      const rows = parseCSV(csvText);
      
      if (rows.length < 2) {
        throw new Error('Sheet has no data rows. Please ensure the Send_Message sheet has at least a header row and one data row.');
      }
      
      const headers = rows[0];
      if (!headers || headers.length === 0) {
        throw new Error('Sheet has no headers. Please check the Send_Message sheet structure.');
      }
      
      const approvalColumnIndex = headers.findIndex(h => 
        h && h.toLowerCase().trim().includes('approval')
      );
      
      if (approvalColumnIndex === -1) {
        throw new Error(`Approval column not found in sheet. Available columns: ${headers.filter(h => h).join(', ')}`);
      }
      
      // PRIMARY METHOD: Use rowId to find the exact row
      // rowId is 1-based sequential counter from fetchSendMessageData
      // It corresponds to the order of entries in the array, not the sheet row number
      // This is the most reliable method when we have duplicates
      let targetRowIndex = -1;
      const firstNameCol = headers.findIndex(h => h && h.toLowerCase().includes('first name'));
      const lastNameCol = headers.findIndex(h => h && h.toLowerCase().includes('last name'));
      const linkedInPostCol = headers.findIndex(h => h && (h.toLowerCase().includes('linkedin post') || h.toLowerCase().includes('linkedin_post')));
      const profileUrlCol = headers.findIndex(h => h && h.toLowerCase().includes('profile url'));
      
      console.log('Row matching - Using rowId as primary method. rowId:', rowId);
      
      const rowIdNum = parseInt(rowId.toString());
      if (isNaN(rowIdNum) || rowIdNum < 1) {
        throw new Error(`Invalid rowId: ${rowId}. rowId must be a positive number.`);
      }
      
      // rowId is 1-based (first entry = 1)
      // We need to find the actual sheet row by counting non-empty rows
      // This matches the exact logic used in fetchSendMessageData
      let entryCounter = 0;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        // Skip empty rows (same logic as fetchSendMessageData)
        if (!row || row.every(cell => !cell || cell.trim() === '')) continue;
        
        // Check if this row has required fields (same as fetchSendMessageData)
        const rowFirstName = firstNameCol !== -1 ? (row[firstNameCol] || '').toString().trim() : '';
        const rowLastName = lastNameCol !== -1 ? (row[lastNameCol] || '').toString().trim() : '';
        const rowProfileUrl = profileUrlCol !== -1 ? (row[profileUrlCol] || '').toString().trim() : '';
        
        // Only count rows that would be included in fetchSendMessageData
        // This matches the condition: if (firstName || lastName || profileUrl)
        if (rowFirstName || rowLastName || rowProfileUrl) {
          entryCounter++;
          if (entryCounter === rowIdNum) {
            targetRowIndex = i + 1; // +1 for header row
            console.log(`Found row by rowId: rowId ${rowIdNum} = sheet row ${targetRowIndex}`);
            
            // Verify the row matches the provided data (safety check)
            if (firstName && lastName && linkedinPost && firstNameCol !== -1 && lastNameCol !== -1 && linkedInPostCol !== -1) {
              const rowFirstNameCheck = (row[firstNameCol] || '').toString().trim().toLowerCase();
              const rowLastNameCheck = (row[lastNameCol] || '').toString().trim().toLowerCase();
              const rowLinkedInPostCheck = (row[linkedInPostCol] || '').toString().trim().toLowerCase();
              
              const normalizedFirstName = (firstName || '').toString().trim().toLowerCase();
              const normalizedLastName = (lastName || '').toString().trim().toLowerCase();
              const normalizedLinkedInPost = (linkedinPost || '').toString().trim().toLowerCase();
              
              if (rowFirstNameCheck !== normalizedFirstName ||
                  rowLastNameCheck !== normalizedLastName ||
                  rowLinkedInPostCheck !== normalizedLinkedInPost) {
                console.warn(`Warning: rowId ${rowIdNum} points to sheet row ${targetRowIndex}, but data doesn't match exactly.`);
                console.warn(`Expected: ${normalizedFirstName} ${normalizedLastName} | ${normalizedLinkedInPost.substring(0, 50)}`);
                console.warn(`Found: ${rowFirstNameCheck} ${rowLastNameCheck} | ${rowLinkedInPostCheck.substring(0, 50)}`);
                // Still proceed with the update - rowId is the source of truth
              }
            }
            break;
          }
        }
      }
      
      // Validate the row exists
      if (targetRowIndex === -1) {
        throw new Error(`Row with rowId ${rowId} not found. Checked ${entryCounter} valid entries in sheet with ${rows.length} total rows.`);
      }
      
      if (targetRowIndex > rows.length) {
        throw new Error(`Row ${targetRowIndex} does not exist in sheet. Sheet has ${rows.length} rows.`);
      }
      
      console.log(`Final target row index: ${targetRowIndex} (sheet row number)`);
      
      // Use Google Apps Script Web App URL
      // This will be set up in the Google Sheet itself
      const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
      
      if (!scriptUrl) {
        // If no script URL, try to use Google Sheets API directly with edit access
        // For sheets with edit access, we can use a simpler approach
        // But we still need to update via API
        
        // Since you have edit access, we'll use a direct API call
        // But this requires the sheet to be accessible via API
        throw new Error('GOOGLE_APPS_SCRIPT_URL not configured. Please set up Google Apps Script in your sheet.');
      }
      
      // Convert approval status to the format expected by Google Sheet
      // Sheet expects: "Approved", "Rejected", "Sent" (capitalized)
      // We receive: "approval", "reject", "sent" (lowercase)
      const approvalMap: Record<string, string> = {
        'approval': 'Approved',
        'reject': 'Rejected',
        'sent': 'Sent',
      };
      const sheetApprovalValue = approvalMap[approval] || approval;
      
      // Prepare the update data
      const updateData = {
        action: 'updateApproval',
        sheetId: SHEET_ID,
        sheetName: SHEET_NAME,
        row: targetRowIndex,
        column: approvalColumnIndex + 1,
        value: sheetApprovalValue, // Use capitalized value for Google Sheet
        firstName: firstName,
        lastName: lastName,
        linkedinPost: linkedinPost,
      };
      
      console.log('Calling Google Apps Script with data:', {
        ...updateData,
        originalApproval: approval,
        mappedApproval: sheetApprovalValue,
      });
      
      // Call Google Apps Script Web App
      // Note: Google Apps Script Web Apps may redirect, so we need to handle that
      const scriptResponse = await fetch(scriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
        redirect: 'follow', // Follow redirects
      });
      
      console.log('Script response status:', scriptResponse.status);
      console.log('Script response headers:', Object.fromEntries(scriptResponse.headers.entries()));
      
      const responseText = await scriptResponse.text();
      console.log('Script response text (first 500 chars):', responseText.substring(0, 500));
      
      // Google Apps Script might return 200 even on errors, so check the content
      if (!scriptResponse.ok && scriptResponse.status !== 200) {
        throw new Error(`Script execution failed: ${scriptResponse.status} - ${responseText.substring(0, 200)}`);
      }
      
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        // If response is not JSON, it might be HTML (error page) or plain text
        if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
          throw new Error('Google Apps Script returned an error page. Please check that:\n1. The script is deployed as a Web App\n2. The script is authorized\n3. The deployment has "Anyone" access');
        }
        // If it's plain text that looks like an error
        if (responseText.toLowerCase().includes('error') || responseText.toLowerCase().includes('exception')) {
          throw new Error(`Script error: ${responseText.substring(0, 200)}`);
        }
        result = { rawResponse: responseText, success: true }; // Assume success if we can't parse
      }
      
      console.log('Script result:', JSON.stringify(result, null, 2));
      
      if (result.success === false) {
        throw new Error(result.error || 'Script returned success: false');
      }
      
      // If no success field but also no error, assume it worked
      if (result.success === undefined && result.error) {
        throw new Error(result.error);
      }
      
      console.log('Successfully updated Google Sheet via Apps Script:', {
        row: targetRowIndex,
        column: approvalColumnIndex + 1,
        value: approval,
        result,
      });

      return NextResponse.json({
        success: true,
        message: 'Message approval status updated successfully in Google Sheet',
        data: {
          rowId,
          approval,
          rowNumber: targetRowIndex,
        },
      });
    } catch (updateError) {
      console.error('Error updating Google Sheet:', updateError);
      return NextResponse.json(
        { 
          error: 'Failed to update Google Sheet', 
          details: updateError instanceof Error ? updateError.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error updating message approval status:', error);
    return NextResponse.json(
      { error: 'Failed to update message approval status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
