import './globals.css';
import { ToastProvider } from './components/Toast';

export const metadata = {
  title: 'CRMS',
  description: 'Customer Relationship Management System',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
