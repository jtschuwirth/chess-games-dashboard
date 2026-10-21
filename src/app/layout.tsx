import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/*
  No `title` here on purpose. Every page is a client component behind an auth guard, so
  the title is a `<title>` each one renders and React hoists — and a metadata title would
  be a second one, with which of them the browser shows left to the order the document
  streamed in. The sign-in page renders its own.
*/
export const metadata: Metadata = {
  description: "Sync your chess.com and lichess games and track how your openings score",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
