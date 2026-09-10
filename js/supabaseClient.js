// Cliente compartido de Supabase para la tiendita y el panel admin.
// Solo la clave "anon" (pública) va aquí. La "service_role" nunca
// debe usarse en código que corre en el navegador.
const SUPABASE_URL = "https://aounszeiigmitvjckdey.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvdW5zemVpaWdtaXR2amNrZGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3ODEyNTYsImV4cCI6MjEwMjM1NzI1Nn0.6bI-YaC5aOacMQ3LgwelZWqbcl8ALNyP92Oqf1SkIF8";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
