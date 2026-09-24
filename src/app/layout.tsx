import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commonline Service Desk — Intake Workbench",
  description: "A fictional service request intake and follow-through workbench.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
