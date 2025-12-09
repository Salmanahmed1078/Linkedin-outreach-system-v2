# Vercel Deployment Guide

## Required Environment Variables

Add these environment variables in your Vercel project settings:

1. **GOOGLE_APPS_SCRIPT_URL** (Optional but recommended)
   - Required for the Messages Approval feature to update Google Sheets
   - Get this URL from your Google Apps Script Web App deployment
   - If not set, the Messages Approval update feature will show an error

## How to Set Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Click on **Settings** → **Environment Variables**
3. Add each variable:
   - **Name**: `GOOGLE_APPS_SCRIPT_URL`
   - **Value**: Your Google Apps Script Web App URL
   - **Environment**: Select all (Production, Preview, Development)
4. Click **Save**
5. **Redeploy** your application for changes to take effect

## Troubleshooting 404 Errors

If you see a 404 error on Vercel:

1. **Check Build Logs**: Go to Vercel dashboard → Deployments → Click on the latest deployment → View build logs
2. **Check Environment Variables**: Ensure all required variables are set
3. **Check Root Route**: The app should load at `/` - if you see 404, check:
   - Build completed successfully
   - No TypeScript errors
   - No missing dependencies

## Common Issues

### Blank Page or 404
- **Cause**: Build might have failed or routing issue
- **Solution**: Check Vercel build logs for errors

### Authentication Not Working
- **Cause**: localStorage not available during SSR
- **Solution**: Already fixed in the code - page now handles SSR correctly

### Messages Approval Not Updating
- **Cause**: Missing `GOOGLE_APPS_SCRIPT_URL` environment variable
- **Solution**: Add the environment variable in Vercel settings

## Build Configuration

The app uses Next.js 14 with:
- **Framework**: Next.js
- **Build Command**: `npm run build` (automatic)
- **Output Directory**: `.next` (automatic)
- **Install Command**: `npm install` (automatic)

No additional configuration needed - Vercel auto-detects Next.js projects.



