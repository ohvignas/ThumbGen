import ChaineSection from "@/components/settings/ChaineSection";
import ChannelKnowledgeCard from "@/components/settings/ChannelKnowledgeCard";
import YoutubeConnectCard from "@/components/settings/YoutubeConnectCard";

export const metadata = { title: "Ma chaîne · Réglages · ThumbGen" };

export default function ChainePage() {
  return (
    <>
      <YoutubeConnectCard />
      <ChannelKnowledgeCard />
      <ChaineSection />
    </>
  );
}
