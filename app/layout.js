import "./globals.css";
import { ToastProvider } from "./components/Toast";
import { ShowAmountProvider } from "./components/ShowAmountProvider";

export const metadata = {
  title: "CRMS",
  description: "Customer Relationship Management System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <ShowAmountProvider>{children}</ShowAmountProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
