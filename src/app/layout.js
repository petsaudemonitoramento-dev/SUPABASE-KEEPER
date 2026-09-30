import "./globals.css";

export const metadata = {
  title: "Supabase Keeper",
  description: "Keep-alive leve e silencioso para projetos Supabase."
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
