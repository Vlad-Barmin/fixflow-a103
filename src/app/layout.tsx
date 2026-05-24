import type { Metadata } from 'next'
import { Manrope } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-manrope',
})

export const metadata: Metadata = {
  title: 'FixFlow A103',
  description: 'Система управления гарантийными заявками ЖК A103',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#F5F5F5] text-zinc-900 font-sans">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
