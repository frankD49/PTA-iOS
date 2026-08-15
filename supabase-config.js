import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://pvhfkjinyrgxakvsoblp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2aGZramlueXJneGFrdnNvYmxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NzA4OTQsImV4cCI6MjEwMTU0Njg5NH0.qduW_NOxJZUqaH9xz7b1fzePv4pF8PqCdBkM6bmTl4o';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  storage: {
    autoRefreshToken: true,
  },
});

window.supabase = supabase;
