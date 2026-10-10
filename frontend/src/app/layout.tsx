import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sutra Mini — Shree Radha Studio Jobwork Sync',
  description: 'Reliable accounting push dashboard for jobwork receipt vouchers',
};

const extensionErrorSuppressor = `
  (function() {
    function isExtensionError(err, msg, filename) {
      var str = (err && (err.stack || err.message || err.toString())) || msg || '';
      var file = filename || '';
      return (
        str.indexOf('MetaMask') !== -1 ||
        str.indexOf('chrome-extension://') !== -1 ||
        str.indexOf('moz-extension://') !== -1 ||
        file.indexOf('chrome-extension://') !== -1
      );
    }

    window.addEventListener('unhandledrejection', function(e) {
      if (isExtensionError(e.reason)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);

    window.addEventListener('error', function(e) {
      if (isExtensionError(e.error, e.message, e.filename)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: extensionErrorSuppressor,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
