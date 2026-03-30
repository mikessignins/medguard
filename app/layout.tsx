import type { Metadata } from 'next'
import { Figtree } from 'next/font/google'
import './globals.css'

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
})

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
    <html lang="en" className={figtree.variable}>
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
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
