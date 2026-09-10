// Cliente compartido de Supabase para la tiendita y el panel admin.
//
// Va la clave PUBLICABLE, la que Supabase diseñó para vivir a la vista en
// el navegador. Este proyecto tiene desactivadas las claves antiguas
// ("anon", las que empiezan con eyJ): responden "Invalid API key".
// La clave secreta (service_role / secret) nunca debe aparecer aquí:
// cualquiera podría leerla desde el código de la página.
const SUPABASE_URL = "https://pupjkwkneuczqpjrmuxt.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_m5SR2Jch-F_rRM2CbkOd6w_m635N1lf";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
