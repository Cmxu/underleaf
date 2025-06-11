# Supabase Authentication Setup

This guide will help you set up Supabase authentication for your Underleaf application.

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create an account
2. Create a new project
3. Wait for the project to be set up (this may take a few minutes)

## 2. Get Your Project Credentials

1. In your Supabase dashboard, go to **Settings** > **API**
2. Copy the following values:
   - **Project URL** (looks like: `https://your-project-id.supabase.co`)
   - **Anon public key** (starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)

## 3. Configure Environment Variables

Create a `.env` file in the `frontend` directory with the following content:

```env
PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

Replace the placeholder values with your actual Supabase credentials.

## 4. Configure Authentication Providers (Optional)

If you want to enable GitHub and Google OAuth:

### GitHub OAuth
1. In Supabase dashboard, go to **Authentication** > **Providers**
2. Enable GitHub provider
3. Create a GitHub OAuth App:
   - Go to GitHub Settings > Developer settings > OAuth Apps
   - Create new OAuth App
   - Set Authorization callback URL to: `https://your-project-id.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret to Supabase

### Google OAuth
1. In Supabase dashboard, go to **Authentication** > **Providers**
2. Enable Google provider
3. Create a Google OAuth App:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create new project or select existing
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Set authorized redirect URI to: `https://your-project-id.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret to Supabase

## 5. Configure Site URL

In your Supabase dashboard:
1. Go to **Authentication** > **URL Configuration**
2. Set **Site URL** to: `http://localhost:5173` (for development)
3. Add additional redirect URLs if needed

## 6. Test the Setup

1. Start your development server: `npm run dev`
2. Navigate to your application
3. Try signing up with email or OAuth providers
4. Check the Supabase dashboard **Authentication** > **Users** to see registered users

## Troubleshooting

- **Environment variables not loading**: Make sure your `.env` file is in the `frontend` directory and restart your dev server
- **OAuth not working**: Check that your callback URLs are correctly configured in both Supabase and the OAuth provider
- **CORS errors**: Ensure your Site URL is correctly set in Supabase dashboard

## Security Notes

- Never commit your `.env` file to version control
- The anon key is safe to use in client-side code as it has limited permissions
- For production, make sure to configure proper Row Level Security (RLS) policies in Supabase 