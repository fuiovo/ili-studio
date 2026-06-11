import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ИЛИ Studio — генератор видео «Что выберешь?»",
  description:
    "Генератор вирусных вертикальных видео в формате «Что выберешь?» — сценарий, картинки, озвучка и рендер.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
