import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cheat Sheet Maker",
  description: "Create cheat sheets from screenshots",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
