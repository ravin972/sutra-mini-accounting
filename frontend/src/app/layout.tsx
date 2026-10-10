import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sutra Mini — Shree Radha Studio Jobwork Sync',
  description: 'Reliable accounting push dashboard for jobwork receipt vouchers',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
