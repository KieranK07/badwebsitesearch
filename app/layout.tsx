import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bad Website Search",
  description: "Find nearby businesses whose websites need work.",
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
