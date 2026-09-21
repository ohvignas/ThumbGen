import VideoEditor from "@/components/studio/VideoEditor";

export default async function VideoPage({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  return <VideoEditor videoId={videoId} />;
}
