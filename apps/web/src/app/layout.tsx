import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Attendance System",
  description: "Attendance system for teachers with Supabase sync"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
