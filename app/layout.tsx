import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Licores Alquimia", template: "%s · Licores Alquimia" },
  description: "Gestión de producción, stock, ventas y trazabilidad de Licores Alquimia",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
