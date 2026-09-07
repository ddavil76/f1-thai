import "./globals.css";
import BottomNav from "@/components/BottomNav";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body style={{ backgroundColor: '#0a0a0a', color: '#ffffff', minHeight: '100vh', margin: 0, fontFamily: 'sans-serif' }}>
        <nav style={{ padding: '16px', borderBottom: '1px solid #333' }}>
          <span style={{ fontWeight: 'bold', color: '#dc2626' }}>F1 THAI</span>
        </nav>
        <main style={{ padding: '24px', paddingBottom: '96px', maxWidth: '800px', margin: '0 auto' }}>
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
