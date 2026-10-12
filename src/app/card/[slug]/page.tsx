import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCard } from "@/lib/card";
import { ReportCardView } from "@/components/report-card-view";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const card = await getPublicCard(slug);
  if (!card) return { title: "Report card not found" };
  const title = `${card.match.left_puller} vs ${card.match.right_puller} — Report Card`;
  const description = `${card.left.name}: ${card.left.totals.green} green / ${card.left.totals.red} red · ${card.right.name}: ${card.right.totals.green} green / ${card.right.totals.red} red`;
  return {
    title,
    description,
    openGraph: { title, description, images: [`/card/${slug}/png`] },
    twitter: { card: "summary_large_image", title, description, images: [`/card/${slug}/png`] },
  };
}

export default async function CardPage({ params }: Params) {
  const { slug } = await params;
  const card = await getPublicCard(slug);
  if (!card) notFound();
  return <ReportCardView card={card} />;
}
