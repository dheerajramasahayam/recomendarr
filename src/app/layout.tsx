import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recomendarr — AI-Powered Media Recommendations",
  description: "Smart media recommendations powered by AI, TMDb, Sonarr & Radarr. Get personalized movie and TV show suggestions based on your watch history.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
