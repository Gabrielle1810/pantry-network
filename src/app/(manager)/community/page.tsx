// Placeholder — the real Community page (offers/requests/claim/pickup) is built
// in Step 5. Uses the renameable label so the title stays in sync.
import { COMMUNITY_LABEL } from "@/lib/labels";

export default function CommunityPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">{COMMUNITY_LABEL}</h1>
      <p className="text-muted">Coming in Step 5: claim nearby offers, post offers and requests, pickups move stock.</p>
    </div>
  );
}
