import "./globals.css";
import { Inter } from "next/font/google";
import { ToastProvider } from "./components/Toast";
import { ShowAmountProvider } from "./components/ShowAmountProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "CRMS",
  description: "Customer Relationship Management System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <ToastProvider>
          <ShowAmountProvider>{children}</ShowAmountProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
