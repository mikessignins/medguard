import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MedPass Web',
  description: 'Clinical Fitness-for-Work Declaration Management Portal',
  icons: {
    icon: '/medm8-icon.png',
    apple: '/medm8-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('theme');
              if (t === 'light') document.documentElement.dataset.theme = 'light';
            } catch(e) {}
          })();
        `}} />
      </head>
      <body className="bg-slate-950 min-h-screen text-slate-100">{children}</body>
    </html>
  )
}
